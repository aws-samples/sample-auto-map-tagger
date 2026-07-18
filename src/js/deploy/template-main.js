        function generateMainTemplate(config) {
            const mpe = config.mpeId;
            const isMulti = config.deployMode === 'multi';
            const scopeMode = config.scopeMode;
            const vpcIds = JSON.stringify(config.scopedVpcIds);
            const tagNonVpc = config.tagNonVpcServices;
            const scopedAccountIdsJson = (config.useAccountScope && config.stacksetAccounts && config.stacksetAccounts.length > 0)
                ? JSON.stringify(config.stacksetAccounts.map(a => a.id))
                : '["ALL"]';
            const scopedVpcIdsJson = (config.scopedVpcIds && config.scopedVpcIds.length > 0 && config.scopedVpcIds[0] !== 'NONE')
                ? JSON.stringify(config.scopedVpcIds)
                : '[]';
            const alertEmail = config.alertEmail || '';

            const backfillEventNamesList = [...new Set(ALL_EVENT_NAMES)].map(e => `            '${e}'`).join(',\n');

            const backfillResources = config.includeBackfill ? `
  BackfillRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: !Sub 'map-auto-tagger-backfill-${mpe}-\${AWS::Region}'
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              Service: lambda.amazonaws.com
            Action: sts:AssumeRole
      Policies:
        - PolicyName: backfill-policy
          PolicyDocument:
            Version: '2012-10-17'
            Statement:
              - Sid: BackfillCloudTrail
                Effect: Allow
                Action: cloudtrail:LookupEvents
                Resource: '*'
              - Sid: BackfillSendToQueue
                Effect: Allow
                Action: sqs:SendMessage
                Resource: !GetAtt EventQueue.Arn
              - Sid: BackfillLogging
                Effect: Allow
                Action:
                  - logs:CreateLogGroup
                  - logs:CreateLogStream
                  - logs:PutLogEvents
                Resource: !Sub 'arn:aws:logs:\${AWS::Region}:\${AWS::AccountId}:*'

  BackfillFunction:
    Type: AWS::Lambda::Function
    Properties:
      FunctionName: map-auto-tagger-backfill-${mpe}
      Runtime: python3.12
      Handler: index.handler
      Role: !GetAtt BackfillRole.Arn
      Timeout: 900
      MemorySize: 256
      Environment:
        Variables:
          EVENT_QUEUE_URL: !Ref EventQueue
          AGREEMENT_START_DATE: '${config.agreementDate}'
      Code:
        ZipFile: |
          import json, os, boto3, time
          from datetime import datetime, timezone
          from concurrent.futures import ThreadPoolExecutor, as_completed
          from urllib.request import urlopen, Request

          sqs_client = boto3.client('sqs')
          cloudtrail_client = boto3.client('cloudtrail')

          EVENT_QUEUE_URL = os.environ['EVENT_QUEUE_URL']
          AGREEMENT_START_DATE = os.environ['AGREEMENT_START_DATE']

          EVENT_NAMES = [
${backfillEventNamesList}
          ]

          def respond(event, context, status, reason=''):
              body = json.dumps({
                  'Status': status,
                  'Reason': reason or 'See CloudWatch logs',
                  'PhysicalResourceId': context.log_stream_name,
                  'StackId': event['StackId'],
                  'RequestId': event['RequestId'],
                  'LogicalResourceId': event['LogicalResourceId']
              })
              req = Request(event['ResponseURL'], data=body.encode(), method='PUT')
              req.add_header('Content-Type', '')
              req.add_header('Content-Length', str(len(body)))
              urlopen(req)

          def lookup_events(event_name, start_time, deadline):
              # deadline: epoch seconds after which we must stop and let the
              # handler respond to CFN. Exceeding the Lambda's hard 900s
              # timeout kills the process BEFORE respond() runs -> CFN never
              # gets its callback, retries 3x, and the whole stack creation
              # stalls permanently (gate 32B-5/32B-7: an old agreement date +
              # the full event-type list overran the budget). A truncated
              # backfill that responds beats a complete one that never does.
              results = []
              lookup_error = None
              kwargs = {
                  'LookupAttributes': [{'AttributeKey': 'EventName', 'AttributeValue': event_name}],
                  'StartTime': start_time,
                  'MaxResults': 50
              }
              throttle_retry = 0
              while True:
                  if time.time() >= deadline:
                      lookup_error = 'time budget exhausted'
                      break
                  try:
                      resp = cloudtrail_client.lookup_events(**kwargs)
                      throttle_retry = 0
                      for ev in resp.get('Events', []):
                          ct = json.loads(ev['CloudTrailEvent'])
                          if ct.get('errorCode') or ct.get('errorMessage'):
                              continue
                          results.append(ct)
                      next_token = resp.get('NextToken')
                      if next_token:
                          kwargs['NextToken'] = next_token
                      else:
                          break
                  except Exception as e:
                      err_str = str(e)
                      # CloudTrail normally throws 'ThrottlingException' (with 'ing'),
                      # but the variant 'ThrottledException' (with 'ed') has been observed
                      # in some paths — PR #17 class. Match both for defensive symmetry.
                      if ('ThrottlingException' in err_str or 'ThrottledException' in err_str or 'Rate exceeded' in err_str) and throttle_retry < 4:
                          throttle_retry += 1
                          time.sleep((2 ** throttle_retry) * 0.5)
                          continue
                      print(f"LookupEvents error for {event_name}: {e}")
                      lookup_error = err_str
                      break
              return (results, lookup_error)

          def handler(event, context):
              # Handle CloudFormation Custom Resource
              request_type = event.get('RequestType', '')
              if request_type == 'Delete':
                  respond(event, context, 'SUCCESS', 'Nothing to delete')
                  return

              try:
                  # Read scope from Custom Resource properties (updated on each stack update)
                  resource_props = event.get('ResourceProperties', {})
                  scoped_accounts = json.loads(resource_props.get('ScopedAccounts', '["ALL"]'))

                  # Account scope pre-check
                  local_account = boto3.client('sts').get_caller_identity()['Account']
                  if scoped_accounts != ['ALL'] and local_account not in scoped_accounts:
                      print(f"Backfill: account {local_account} not in scope {scoped_accounts}, skipping.")
                      respond(event, context, 'SUCCESS', 'Account not in scope')
                      return

                  try:
                      start_time = datetime.strptime(AGREEMENT_START_DATE, '%Y-%m-%d').replace(tzinfo=timezone.utc)
                  except ValueError:
                      print(f"Backfill: invalid AGREEMENT_START_DATE '{AGREEMENT_START_DATE}', cannot run backfill.")
                      respond(event, context, 'SUCCESS', f'Invalid agreement start date: {AGREEMENT_START_DATE}')
                      return
                  print(f"Backfill: querying CloudTrail from {AGREEMENT_START_DATE} for {len(EVENT_NAMES)} event types")

                  # Time budget: stop lookups with enough runway left to
                  # enqueue what we found AND deliver the CFN response.
                  # get_remaining_time_in_millis tracks the real 900s ceiling;
                  # 120s reserve covers the SQS send loop + respond() PUT.
                  deadline = time.time() + (context.get_remaining_time_in_millis() / 1000.0) - 120
                  all_events = []
                  lookup_errors = 0
                  timed_out_types = 0
                  with ThreadPoolExecutor(max_workers=3) as executor:
                      futures = {executor.submit(lookup_events, name, start_time, deadline): name for name in EVENT_NAMES}
                      for future in as_completed(futures):
                          events, err = future.result()
                          all_events.extend(events)
                          if err == 'time budget exhausted':
                              timed_out_types += 1
                          elif err is not None:
                              lookup_errors += 1

                  print(f"Backfill: found {len(all_events)} creation events ({lookup_errors} event types failed LookupEvents, {timed_out_types} cut off by time budget)")

                  sent = 0
                  errors = 0
                  unsent = 0
                  # Half the reserve is for this loop; the rest stays for
                  # respond(). A huge haul (SQS sends are ~10ms each) must
                  # not eat the runway the CFN callback needs.
                  send_deadline = deadline + 60
                  for ct_event in all_events:
                      if time.time() >= send_deadline:
                          unsent = len(all_events) - sent - errors
                          print(f"Backfill: send loop cut off by time budget, {unsent} events not enqueued")
                          break
                      eb_event = {
                          'version': '0',
                          'source': f"aws.{ct_event.get('eventSource','').split('.')[0]}",
                          'detail-type': 'AWS API Call via CloudTrail',
                          'detail': ct_event
                      }
                      try:
                          # Route backfill events through the same SQS pipeline as live events.
                          # Single code path -- same Lambda, same retry behavior, same DLQ.
                          sqs_client.send_message(
                              QueueUrl=EVENT_QUEUE_URL,
                              MessageBody=json.dumps(eb_event)
                          )
                          sent += 1
                      except Exception as e:
                          print(f"SendMessage error for {ct_event.get('eventName','?')}: {e}")
                          errors += 1

                  # Report SUCCESS to unblock stack create, but surface real counts in the
                  # Reason so operators reading CFN events can tell whether backfill hit
                  # LookupEvents errors / SendMessage errors. Prior behavior always said
                  # "Backfill: N sent, 0 errors" regardless, masking LookupEvents failures.
                  print(f"Backfill complete: {sent} events sent to EventQueue, {errors} send errors, {lookup_errors} lookup errors, {timed_out_types} event types cut off by time budget")
                  reason = f'Backfill: {sent} sent, {errors} send errors, {lookup_errors}/{len(EVENT_NAMES)} event types failed lookup'
                  if timed_out_types or unsent:
                      reason += f'; PARTIAL — cut off by the 15-min Lambda budget ({timed_out_types}/{len(EVENT_NAMES)} event types not fully queried, {unsent} found events not enqueued). Old agreement start date + large event history. Pre-deploy resources in the cut-off types may be untagged — consider a manual tag sweep.'
                  respond(event, context, 'SUCCESS', reason)
              except Exception as e:
                  # Top-level exception — backfill could not run at all (permissions,
                  # SSM read, date parse, etc). Report SUCCESS with error detail in Reason
                  # so the stack still succeeds (backfill is best-effort; live tagging is
                  # unaffected) but the failure is visible in CFN event history.
                  import traceback
                  print(traceback.format_exc())
                  respond(event, context, 'SUCCESS', f'Backfill error (non-fatal): {str(e)[:300]}')

  BackfillTrigger:
    Type: Custom::Backfill
    DependsOn: [AutoTaggerFunction, AutoTagEventRule, EventQueue, EventQueueMapping]
    Properties:
      ServiceToken: !GetAtt BackfillFunction.Arn
      ScopedAccounts: '${scopedAccountIdsJson}'
` : '';


            const permissionsList = TAGGING_PERMISSIONS.map(p => `                  - ${p}`).join('\n');

            const eventNamesList = [...new Set(ALL_EVENT_NAMES)].map(e => `            - ${e}`).join('\n');
            const sourcesList = ALL_SOURCES.map(s => `          - ${s}`).join('\n');

            // TEMPLATE_VERSION is the module-level constant declared near the top of this script.
            return `# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
AWSTemplateFormatVersion: '2010-09-09'
Description: >
  MAP 2.0 Auto-Tagger ${TEMPLATE_VERSION} for ${config.customerName || 'Customer'} (MPE: ${mpe}).
  Auto-tags 140+ AWS resource types within typically 60-90 seconds (up to 15 minutes during high-volume activity) of creation.
  ${isMulti ? 'Deploy via StackSet to all accounts in org.' : 'Deploy in the migration account.'}
  ${TEMPLATE_VERSION}: Resilient event pipeline - EventBridge now routes via SQS queue (14-day retention,
  vs EventBridge 24h limit); removed ReservedConcurrentExecutions to prevent deployment
  failures on accounts near Lambda concurrency quota; added DLQ alarm with SNS email
  notification; Lambda publishes specific failed resource ARN to SNS on tagging failure.

Parameters:
  MpeId:
    Type: String
    Default: '${mpe}'
    AllowedPattern: ^mig[a-zA-Z0-9]+$
    MaxLength: 44
    Description: MAP 2.0 MPE ID
  AgreementStartDate:
    Type: String
    Default: '${config.agreementDate}'
    AllowedPattern: ^(19|20)\\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$
    Description: MAP agreement start date (YYYY-MM-DD)
  AgreementEndDate:
    Type: String
    Default: '${config.agreementEndDate}'
    AllowedPattern: ^(19|20)\\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$
    Description: MAP agreement end date (YYYY-MM-DD)
  ScopeMode:
    Type: String
    Default: '${scopeMode}'
    AllowedValues: [account, vpc]
  ScopedAccountIds:
    Type: String
    Default: '${scopedAccountIdsJson}'
    Description: JSON array of scoped account IDs or ["ALL"]
  ScopedVpcIds:
    Type: String
    Default: '${scopedVpcIdsJson}'
    Description: JSON array of scoped VPC IDs or []
  TagNonVpcServices:
    Type: String
    Default: '${tagNonVpc}'
    AllowedValues: ['true', 'false']
    Description: Whether to tag non-VPC services when VPC scoping is active
  AlertEmail:
    Type: String
    Default: '${alertEmail}'
    Description: Customer ops email for tagging failure alerts (leave empty to disable)
  CentralAlertAccountId:
    Type: String
    Default: ''
    AllowedPattern: '^$|^[0-9]{12}$'
    Description: >-
      Management-account ID hosting the central alert topics (multi-account
      mode). If provided, alarms publish to the central topic
      auto-map-tagger-alerts-central-<MpeId> in THIS region of that account
      instead of creating a per-account topic. CloudWatch alarm actions
      support cross-account topics but NOT cross-region ones, so the ARN is
      constructed with the alarm's own region — the org deployer creates one
      central topic per deployed region.

Conditions:
  HasAlertEmail: !Not [!Equals [!Ref AlertEmail, '']]
  HasCentralTopic: !Not [!Equals [!Ref CentralAlertAccountId, '']]
  CreateLocalTopic: !Not [!Condition HasCentralTopic]
  CreateLocalSubscription: !And
    - !Condition HasAlertEmail
    - !Condition CreateLocalTopic

Resources:

  # Template version pinned at deploy time — read by ops, upgrade.sh, and
  # external tooling. No outbound network calls; discovered locally via SSM.
  MapVersion:
    Type: AWS::SSM::Parameter
    Properties:
      Name: /auto-map-tagger/${mpe}/version
      Type: String
      Description: MAP 2.0 Auto-Tagger template version pinned at deploy time
      Value: ${TEMPLATE_VERSION}

  MapConfig:
    Type: AWS::SSM::Parameter
    Properties:
      Name: !Sub /auto-map-tagger/\${MpeId}/config
      # Tier: Intelligent-Tiering — see §1.60.
      # Customers with ~240+ accounts in scoped_account_ids produce a Value > 4KB; AWS
      # auto-upgrades to Advanced tier ($0.05/parameter/month) instead of failing stack
      # create with ParameterMaxSizeExceeded. Zero cost impact below the threshold.
      Tier: Intelligent-Tiering
      # SECURITY NOTE: Type: String is intentional. The stored values (MPE ID, agreement
      # dates, account/VPC scope lists) are non-sensitive operational configuration — not
      # credentials, secrets, or PII. SecureString would require KMS decrypt permissions
      # on every Lambda invocation with no security benefit for this data classification.
      Type: String
      Value: !Sub |
          {
            "mpe_id": "\${MpeId}",
            "agreement_start_date": "\${AgreementStartDate}",
            "agreement_end_date": "\${AgreementEndDate}",
            "scope_mode": "\${ScopeMode}",
            "scoped_account_ids": \${ScopedAccountIds},
            "scoped_vpc_ids": \${ScopedVpcIds},
            "tag_non_vpc_services": \${TagNonVpcServices}
          }

  AutoTaggerRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: !Sub 'map-auto-tagger-role-${mpe}-\${AWS::Region}'
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              Service: lambda.amazonaws.com
            Action: sts:AssumeRole
      Policies:
        - PolicyName: map-auto-tagger-policy
          PolicyDocument:
            Version: '2012-10-17'
            Statement:
              # SECURITY NOTE: Resource: '*' is required for tagging actions.
              # AWS Tag Editor API (tag:TagResources) does not support resource-level
              # permissions -- it must be scoped to '*'. This is consistent with
              # AWS-managed tagging solutions (e.g., AWS Tag Editor console, MAP Taggr).
              # The Lambda only applies the map-migrated tag and has no create/delete/update
              # permissions outside of tagging. IAM Access Analyzer: 0 findings.
              - Sid: ServiceTagging
                Effect: Allow
                Action:
${permissionsList}
                Resource: '*'
              - Sid: MinimalReads
                Effect: Allow
                Action:
                  - ec2:DescribeInstances
                  - ec2:DescribeVolumes
                  - ec2:DescribeSubnets
                  - sts:GetCallerIdentity
                  - ssm:GetParameters
                  - cloudformation:DescribeStacks
                  - iam:TagRole
                Resource: '*'
              - Sid: SqsEventSource
                Effect: Allow
                Action:
                  - sqs:ReceiveMessage
                  - sqs:DeleteMessage
                  - sqs:GetQueueAttributes
                  - sqs:SendMessage
                Resource:
                  - !GetAtt EventQueue.Arn
                  - !GetAtt EventDLQ.Arn
              - Sid: EmitClassifierMetrics
                Effect: Allow
                Action:
                  - cloudwatch:PutMetricData
                Resource: '*'
                Condition:
                  StringEquals:
                    cloudwatch:namespace: MapAutoTagger
              - Sid: ReadConfig
                Effect: Allow
                Action: ssm:GetParameter
                Resource: !Sub arn:aws:ssm:\${AWS::Region}:\${AWS::AccountId}:parameter/auto-map-tagger/${mpe}/config
              # Peer-tagger detection at cold start. Lists map-auto-tagger-mig*
              # stacks in this account/region to surface concurrent taggers
              # (§1.108 Phase 16). ListStacks has no resource-level IAM per
              # AWS IAM Service Authorization Reference; scope is implicitly
              # the caller's account. Read-only.
              - Sid: PeerTaggerDetect
                Effect: Allow
                Action:
                  - cloudformation:ListStacks
                Resource: '*'
              - Sid: Logging
                Effect: Allow
                Action:
                  - logs:CreateLogGroup
                  - logs:CreateLogStream
                  - logs:PutLogEvents
                Resource: !Sub arn:aws:logs:\${AWS::Region}:\${AWS::AccountId}:*

  # ── Preflight: peer-tagger scope-overlap guard at stack-instance creation ──
  # Runs BEFORE AutoTaggerFunction is created. If another map-auto-tagger-mig*
  # stack exists in this account+region with an overlapping scope, fail the
  # Custom Resource → CFN rolls back this stack instance → no AutoTaggerFunction
  # is ever provisioned. Closes the §1.108 temporal race (StackSet AutoDeployment
  # into newly-joined OU accounts, and member-account deploys where the member
  # already has a peer stack). Fail-open on any internal error.
  PreflightRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: !Sub 'map-preflight-role-${mpe}-\${AWS::Region}'
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              Service: lambda.amazonaws.com
            Action: sts:AssumeRole
      Policies:
        - PolicyName: map-auto-tagger-preflight-policy
          PolicyDocument:
            Version: '2012-10-17'
            Statement:
              - Sid: ListOwnStacks
                Effect: Allow
                Action:
                  - cloudformation:ListStacks
                Resource: '*'
              - Sid: ReadPeerConfigs
                Effect: Allow
                Action:
                  - ssm:GetParameter
                Resource: !Sub arn:aws:ssm:\${AWS::Region}:\${AWS::AccountId}:parameter/auto-map-tagger/*/config
              - Sid: CheckCloudTrailCoverage
                Effect: Allow
                Action:
                  - cloudtrail:DescribeTrails
                  - cloudtrail:GetTrailStatus
                Resource: '*'
              - Sid: Logging
                Effect: Allow
                Action:
                  - logs:CreateLogGroup
                  - logs:CreateLogStream
                  - logs:PutLogEvents
                Resource: !Sub arn:aws:logs:\${AWS::Region}:\${AWS::AccountId}:*

  PreflightFunction:
    Type: AWS::Lambda::Function
    Properties:
      FunctionName: map-auto-tagger-preflight-${mpe}
      Runtime: python3.12
      Handler: index.handler
      Role: !GetAtt PreflightRole.Arn
      Timeout: 60
      MemorySize: 256
      Code:
        ZipFile: |
          import json, os, boto3
          from urllib.request import urlopen, Request

          def respond(event, context, status, reason=''):
              body = json.dumps({
                  'Status': status,
                  'Reason': reason or 'See CloudWatch logs',
                  'PhysicalResourceId': context.log_stream_name,
                  'StackId': event['StackId'],
                  'RequestId': event['RequestId'],
                  'LogicalResourceId': event['LogicalResourceId'],
              })
              req = Request(event['ResponseURL'], data=body.encode(), method='PUT')
              req.add_header('Content-Type', '')
              req.add_header('Content-Length', str(len(body)))
              urlopen(req)

          def scope_overlap(new_mode, new_accts, new_vpcs, peer_mode, peer_accts, peer_vpcs, this_account):
              new_accts = set(new_accts or [])
              peer_accts = set(peer_accts or [])
              new_vpcs = set(new_vpcs or [])
              peer_vpcs = set(peer_vpcs or [])
              if new_mode == 'account' and peer_mode == 'account':
                  if 'ALL' in peer_accts:
                      return f'peer scope=account/ALL dominates {this_account}'
                  if 'ALL' in new_accts:
                      return f'our scope=account/ALL dominates peer in {this_account}'
                  if this_account in peer_accts and (this_account in new_accts or 'ALL' in new_accts):
                      return f'peer scope includes {this_account}'
                  return ''
              if new_mode == 'account' and peer_mode == 'vpc':
                  if 'ALL' in new_accts or this_account in new_accts:
                      return 'our account-mode dominates peer VPC-scope on shared VPCs'
                  return ''
              if new_mode == 'vpc' and peer_mode == 'account':
                  if 'ALL' in peer_accts or this_account in peer_accts:
                      return f'peer account-mode dominates our VPC-scope'
                  return ''
              overlap = new_vpcs & peer_vpcs
              if overlap:
                  return f'shared VPC(s): {sorted(overlap)}'
              return ''

          def _parse_scope_list(raw, drop=()):
              # Custom-resource properties arrive as the JSON STRING the
              # template baked in ('["vpc-0abc"]'), not a list. The old
              # comma-split turned that into ['["vpc-0abc"]'] — bracket-
              # wrapped garbage that never intersected the peer's clean
              # set, so the VPC-overlap preflight NEVER fired (two same-VPC
              # taggers deployed side by side; release-gate P3-C5-SAME-VPC,
              # live-confirmed 2026-07-16). Parse JSON first; fall back to
              # comma-split for hand-entered values.
              if not isinstance(raw, str):
                  return [v for v in (raw or []) if v not in drop]
              try:
                  vals = json.loads(raw)
                  if not isinstance(vals, list):
                      vals = [vals]
              except (ValueError, TypeError):
                  vals = raw.split(',')
              return [s.strip() for s in (str(v) for v in vals)
                      if s.strip() and s.strip() not in drop]

          def check_peers(props, account, region):
              own_mpe = props['MpeId']
              new_mode = props.get('ScopeMode', 'account')
              new_accts = _parse_scope_list(props.get('ScopedAccountIds')) or ['ALL']
              new_vpcs = _parse_scope_list(props.get('ScopedVpcIds'), drop=('NONE',))
              cfn = boto3.client('cloudformation')
              ssm = boto3.client('ssm')
              conflicts = []
              active = ['CREATE_COMPLETE', 'UPDATE_COMPLETE', 'UPDATE_ROLLBACK_COMPLETE']
              for page in cfn.get_paginator('list_stacks').paginate(StackStatusFilter=active):
                  for s in page.get('StackSummaries', []):
                      name = s.get('StackName', '')
                      if name.startswith('StackSet-map-auto-tagger-mig'):
                          peer_mpe = name[len('StackSet-map-auto-tagger-'):]
                      elif name.startswith('map-auto-tagger-mig'):
                          peer_mpe = name[len('map-auto-tagger-'):]
                      else:
                          continue
                      # StackSet instance stack names have a UUID suffix: {mpe}-{uuid}
                      import re
                      peer_mpe = re.sub(r'-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', '', peer_mpe)
                      if peer_mpe == own_mpe:
                          continue
                      try:
                          p = ssm.get_parameter(Name=f'/auto-map-tagger/{peer_mpe}/config')
                          cfg = json.loads(p['Parameter']['Value'])
                      except Exception as e:
                          conflicts.append(f'peer {name} config unreadable ({e.__class__.__name__})')
                          continue
                      peer_mode = cfg.get('scope_mode', 'account')
                      peer_accts = cfg.get('scoped_account_ids') or ['ALL']
                      peer_vpcs = cfg.get('scoped_vpc_ids') or []
                      reason = scope_overlap(
                          new_mode, new_accts, new_vpcs,
                          peer_mode, peer_accts, peer_vpcs,
                          account,
                      )
                      if reason:
                          conflicts.append(f'{name} (MPE {peer_mpe}): {reason}')
              return conflicts

          def cloudtrail_covers_region(region):
              # Runs INSIDE the target account (single-account stack, or a
              # StackSet instance in a linked account) — so this sees exactly
              # what that account has, whether it's a local trail, a
              # multi-region trail homed elsewhere, or an org trail shadowed
              # in from the management account. No org-trail special-casing
              # needed: describe_trails() already reflects all three.
              ct = boto3.client('cloudtrail', region_name=region)
              trails = ct.describe_trails(includeShadowTrails=True).get('trailList', [])
              for t in trails:
                  if not (t.get('HomeRegion') == region or t.get('IsMultiRegionTrail')):
                      continue
                  try:
                      status = ct.get_trail_status(Name=t['TrailARN'])
                  except Exception:
                      continue
                  if status.get('IsLogging'):
                      return True
              return False

          def handler(event, context):
              try:
                  rt = event.get('RequestType', '')
                  if rt in ('Update', 'Delete'):
                      return respond(event, context, 'SUCCESS', f'{rt}: no-op')
                  # Detect upgrade: CFN sends Create for a new resource, but if a
                  # tagger stack with this MpeId already exists then the peer-Lambda
                  # is already live — this is a template upgrade, not a fresh deploy.
                  # Uses ListStacks (already in PreflightRole IAM) instead of
                  # DescribeStacks to avoid needing an extra IAM grant.
                  props = event.get('ResourceProperties', {})
                  own_mpe = props.get('MpeId', '')
                  if own_mpe:
                      own_stack = f'map-auto-tagger-{own_mpe}'
                      cfn_client = boto3.client('cloudformation')
                      active = ['CREATE_COMPLETE', 'UPDATE_COMPLETE', 'UPDATE_ROLLBACK_COMPLETE', 'UPDATE_IN_PROGRESS']
                      for page in cfn_client.get_paginator('list_stacks').paginate(StackStatusFilter=active):
                          for s in page.get('StackSummaries', []):
                              if s['StackName'] == own_stack:
                                  return respond(event, context, 'SUCCESS',
                                                 f'Upgrade detected ({own_stack} exists): skip preflight')
                      # stack not found — genuine first deploy, proceed to check
                  account = context.invoked_function_arn.split(':')[4]
                  region = os.environ.get('AWS_REGION', '')
                  if not cloudtrail_covers_region(region):
                      reason = (
                          f'No active CloudTrail trail covers {region} in account {account} — '
                          'the auto-tagger EventBridge rule matches "AWS API Call via CloudTrail" '
                          'events, so with no trail logging here, resources will be created '
                          'silently with NO tag and NO error. Stack creation blocked. '
                          'Fix: create a trail that logs this region (a single-region trail here, '
                          'a multi-region trail homed anywhere, or an AWS Organizations trail from '
                          'the management account all satisfy this), then retry.'
                      )
                      print(f'PreflightNoCloudTrail: {reason}')
                      return respond(event, context, 'FAILED', reason)
                  conflicts = check_peers(props, account, region)
                  if conflicts:
                      reason = (
                          'Peer tagger scope conflict — stack creation blocked '
                          f'to prevent §1.108 cross-Lambda contamination. '
                          f'Conflicts: {"; ".join(conflicts)[:800]}. '
                          'Resolve via: delete the peer stack, OR narrow this '
                          'deploy\\'s scope to not overlap, OR narrow the peer\\'s scope.'
                      )
                      print(f'PreflightConflict: {reason}')
                      return respond(event, context, 'FAILED', reason)
                  return respond(event, context, 'SUCCESS', 'No peer tagger scope conflict')
              except Exception as e:
                  import traceback
                  print(traceback.format_exc())
                  return respond(event, context, 'SUCCESS', f'Preflight fail-open ({e.__class__.__name__}): {str(e)[:200]}')

  PreflightTrigger:
    Type: Custom::PeerTaggerPreflight
    # No explicit DependsOn — the ServiceToken reference below already
    # creates the implicit dependency on PreflightFunction. Adding an
    # explicit DependsOn produces cfn-lint W3005 (redundant dependency).
    Properties:
      ServiceToken: !GetAtt PreflightFunction.Arn
      MpeId: !Ref MpeId
      ScopeMode: '${scopeMode}'
      ScopedAccountIds: '${scopedAccountIdsJson}'
      ScopedVpcIds: '${scopedVpcIdsJson}'

  AutoTaggerFunction:
    Type: AWS::Lambda::Function
    DependsOn:
      - PreflightTrigger  # Custom Resource must return SUCCESS before tagger is provisioned
    Properties:
      FunctionName: map-auto-tagger-${mpe}
      Runtime: python3.12
      Handler: index.handler
      Role: !GetAtt AutoTaggerRole.Arn
      Timeout: 60
      MemorySize: 256
      # No ReservedConcurrentExecutions -- using SQS buffering. Throttling delays
      # processing but never drops events. Messages retained in SQS for up to 14 days.
      DeadLetterConfig:
        TargetArn: !GetAtt EventDLQ.Arn
      Environment:
        Variables:
          CONFIG_PARAM: /auto-map-tagger/${mpe}/config
      Code:
        ZipFile: |
${LAMBDA_HANDLER_CODE}

  AutoTagEventRule:
    Type: AWS::Events::Rule
    Properties:
      Name: map-auto-tagger-rule-${mpe}
      Description: MAP 2.0 auto-tagger -- triggers on resource creation (140+ services)
      State: ENABLED
      EventPattern:
        detail-type:
          - AWS API Call via CloudTrail
        detail:
          eventName:
            - prefix: "Create"
            - prefix: "Run"
            - prefix: "Activate"
            - prefix: "Register"
            - prefix: "Put"
            - prefix: "Issue"
            - prefix: "Start"
            - prefix: "Request"
            - prefix: "Allocate"
            - prefix: "Launch"
            - prefix: "Import"
            - prefix: "Publish"
            - prefix: "Enable"
            - prefix: "Copy"
            - prefix: "Restore"
            - prefix: "Connect"
      Targets:
        - Arn: !GetAtt EventQueue.Arn
          Id: MapAutoTaggerQueue

  # Permission for EventBridge to send to SQS
  EventQueuePolicy:
    Type: AWS::SQS::QueuePolicy
    Properties:
      Queues:
        - !Ref EventQueue
      PolicyDocument:
        Statement:
          - Effect: Allow
            Principal:
              Service: events.amazonaws.com
            Action: sqs:SendMessage
            Resource: !GetAtt EventQueue.Arn
            Condition:
              ArnEquals:
                aws:SourceArn: !GetAtt AutoTagEventRule.Arn

  # SQS queue -- buffers CloudTrail events for up to 14 days
  # Replaces direct EventBridge -> Lambda invocation to avoid 24h retry limit
  EventQueue:
    Type: AWS::SQS::Queue
    Properties:
      QueueName: map-auto-tagger-events-${mpe}
      # Retry cadence covers slow-provisioning services (ElastiCache Serverless
      # 3-8 min, Aurora 5-10 min). 5 retries x 180s = 900s total retry window.
      VisibilityTimeout: 180
      MessageRetentionPeriod: 1209600
      SqsManagedSseEnabled: true
      RedrivePolicy:
        deadLetterTargetArn: !GetAtt EventDLQ.Arn
        maxReceiveCount: 5

  # Dead letter queue -- receives events that fail after 5 processing attempts
  EventDLQ:
    Type: AWS::SQS::Queue
    Properties:
      QueueName: map-auto-tagger-dlq-${mpe}
      MessageRetentionPeriod: 1209600
      SqsManagedSseEnabled: true

  # Lambda event source mapping -- polls SQS and invokes Lambda.
  # BatchSize=10 + ReportBatchItemFailures: one invocation processes up to 10
  # messages; only per-record failures are redelivered. Raises drain rate ~10x
  # vs prior BatchSize=1 (Phase 16 measured 1.3 msg/s per Lambda -> expected
  # ~10+ msg/s). MaximumBatchingWindowInSeconds=5 fills small batches under
  # steady load without adding latency on idle queues.
  EventQueueMapping:
    Type: AWS::Lambda::EventSourceMapping
    Properties:
      EventSourceArn: !GetAtt EventQueue.Arn
      FunctionName: !Ref AutoTaggerFunction
      BatchSize: 10
      MaximumBatchingWindowInSeconds: 5
      FunctionResponseTypes:
        - ReportBatchItemFailures
      Enabled: true

  AlertTopic:
    Type: AWS::SNS::Topic
    Condition: CreateLocalTopic
    Properties:
      TopicName: auto-map-tagger-alerts-${mpe}
      DisplayName: MAP 2.0 Auto-Tagger Alerts
      # Deliberately NOT KMS-encrypted — the AWS-managed SNS key cannot
      # grant cloudwatch.amazonaws.com kms:GenerateDataKey, so alarm actions
      # to a managed-key-encrypted topic fail 100% silently (CT6-003).

  AlertSubscription:
    Type: AWS::SNS::Subscription
    Condition: CreateLocalSubscription
    Properties:
      TopicArn: !Ref AlertTopic
      Protocol: email
      Endpoint: !Ref AlertEmail

  TaggerErrorAlarm:
    Type: AWS::CloudWatch::Alarm
    Properties:
      AlarmName: map-auto-tagger-errors-${mpe}
      AlarmDescription: MAP auto-tagger Lambda is failing
      Namespace: AWS/Lambda
      MetricName: Errors
      Dimensions:
        - Name: FunctionName
          Value: !Ref AutoTaggerFunction
      Statistic: Sum
      Period: 300
      EvaluationPeriods: 1
      Threshold: 3
      ComparisonOperator: GreaterThanOrEqualToThreshold
      AlarmActions:
        - !If
          - HasCentralTopic
          - !Sub 'arn:aws:sns:\${AWS::Region}:\${CentralAlertAccountId}:auto-map-tagger-alerts-central-\${MpeId}'
          - !Ref AlertTopic

  DLQAlarm:
    Type: AWS::CloudWatch::Alarm
    Properties:
      AlarmName: map-auto-tagger-dlq-${mpe}
      AlarmDescription: !Sub >
        MAP auto-tagger events failed after 5 processing attempts and were moved
        to the dead letter queue. Events are retained for 14 days. DLQ'd events
        do not auto-recover (the reconciliation sweep was removed in v21) and
        must be re-tagged manually via DLQ redrive once the cause is resolved.
        Two failure classes land here: permanent-actionable (IAM drift, unhandled
        resource type) and transient-exhaustion (resource still provisioning past
        the 900s retry budget, e.g. MS AD directories that take 25-45 min).
        To investigate, open CloudWatch Logs Insights in your AWS Console and
        run this query against log group /aws/lambda/map-auto-tagger-\${MpeId}:
        filter @message like /Permanent-actionable/ or @message like /will retry via SQS/
        | parse @message "Permanent-actionable [*] *" as pa_arn, pa_error
        | parse @message "Transient [*] *" as tr_arn, tr_error
        | sort @timestamp desc
        | display @timestamp, pa_arn, pa_error, tr_arn, tr_error
      Namespace: AWS/SQS
      MetricName: ApproximateNumberOfMessagesVisible
      Dimensions:
        - Name: QueueName
          Value: !GetAtt EventDLQ.QueueName
      Statistic: Sum
      Period: 300
      EvaluationPeriods: 1
      Threshold: 1
      ComparisonOperator: GreaterThanOrEqualToThreshold
      AlarmActions:
        - !If
          - HasCentralTopic
          - !Sub 'arn:aws:sns:\${AWS::Region}:\${CentralAlertAccountId}:auto-map-tagger-alerts-central-\${MpeId}'
          - !Ref AlertTopic
      TreatMissingData: notBreaching

  # CloudWatch alarm — fires when the Lambda cold-start peer-tagger detector
  # (§1.108 Phase 16) finds another map-auto-tagger-mig* stack in this
  # account. Concurrent taggers produce non-deterministic map-migrated tag
  # values; alarm surface lets customers find this before a MAP audit does.
  PeerTaggerDetectedAlarm:
    Type: AWS::CloudWatch::Alarm
    Properties:
      AlarmName: map-auto-tagger-peer-detected-${mpe}
      AlarmDescription: >
        Another map-auto-tagger stack was detected in this account at Lambda
        cold-start. Concurrent taggers race on CloudTrail events and the
        map-migrated tag value is last-writer-wins. Review which MPE is
        intended for which resources.
      Namespace: MapAutoTagger
      MetricName: PeerTaggerDetected
      Dimensions:
        - Name: MpeId
          Value: '${mpe}'
      Statistic: Sum
      Period: 3600
      EvaluationPeriods: 1
      Threshold: 1
      ComparisonOperator: GreaterThanOrEqualToThreshold
      AlarmActions:
        - !If
          - HasCentralTopic
          - !Sub 'arn:aws:sns:\${AWS::Region}:\${CentralAlertAccountId}:auto-map-tagger-alerts-central-\${MpeId}'
          - !Ref AlertTopic
      TreatMissingData: notBreaching

  # CloudWatch alarm — slow trickle of permanent_actionable tagging failures
  # (≥6 of the last 24 hourly buckets had ≥1 failure). Catches IAM drift or
  # unhandled resource types that the per-minute errors alarm misses.
  TrickleFailureAlarm:
    Type: AWS::CloudWatch::Alarm
    Properties:
      AlarmName: map-auto-tagger-trickle-failures-${mpe}
      AlarmDescription: >
        Slow trickle of permanent-actionable tagging failures detected
        (≥6 of the last 24 hourly buckets had ≥1 failure). Investigate
        IAM drift, tag-quota exhaustion, or a new resource type the
        classifier isn't handling yet.
      Namespace: MapAutoTagger
      MetricName: TagFailureByClass
      Dimensions:
        - Name: ErrorClass
          Value: permanent_actionable
        - Name: MpeId
          Value: '${mpe}'
      Statistic: Sum
      Period: 3600
      EvaluationPeriods: 24
      DatapointsToAlarm: 6
      Threshold: 1
      ComparisonOperator: GreaterThanOrEqualToThreshold
      AlarmActions:
        - !If
          - HasCentralTopic
          - !Sub 'arn:aws:sns:\${AWS::Region}:\${CentralAlertAccountId}:auto-map-tagger-alerts-central-\${MpeId}'
          - !Ref AlertTopic
      TreatMissingData: notBreaching

${backfillResources}
Outputs:
  LambdaArn:
    Value: !GetAtt AutoTaggerFunction.Arn
  ConfigParameter:
    Value: !Ref MapConfig
  TemplateVersion:
    Description: MAP 2.0 Auto-Tagger template version (pinned at deploy time)
    Value: ${TEMPLATE_VERSION}
  AlertTopicArn:
    Value: !If
      - HasCentralTopic
      - !Sub 'arn:aws:sns:\${AWS::Region}:\${CentralAlertAccountId}:auto-map-tagger-alerts-central-\${MpeId}'
      - !Ref AlertTopic
  EventQueueUrl:
    Value: !Ref EventQueue
  EventDLQUrl:
    Value: !Ref EventDLQ`;
        }

