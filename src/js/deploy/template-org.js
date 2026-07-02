        function generatePerAccountTemplate(config) {
            // Generate the single-account auto-tagger template (Lambda + EventBridge + IAM)
            // Used as the StackSet target in multi-account mode
            const singleConfig = Object.assign({}, config, { deployMode: 'single' });
            return generateMainTemplate(singleConfig);
        }

        function generateOrgTemplate(config) {
            // Generates the management account template.
            // Uses a single Lambda Custom Resource that:
            //   1. Auto-discovers root OU via organizations:ListRoots (no OU input from customer)
            //   2. Fetches the per-account template from S3 using its own IAM role
            //   3. Creates the StackSet with TemplateBody (avoids S3 access issues)
            //   4. Deploys instances to all accounts via root OU targeting
            // Customer runs ONE command. No OU IDs. No account IDs for deployment.
            const mpe = config.mpeId;
            const accounts = (config.stacksetAccounts || []);
            const regions = (config.regions || ['ap-northeast-2']);
            const regionsList = regions.map(r => `        - ${r}`).join('\n');
            const scopedAccountIdsJson = (config.useAccountScope && config.stacksetAccounts && config.stacksetAccounts.length > 0)
                ? JSON.stringify(config.stacksetAccounts.map(a => a.id))
                : '["ALL"]';
            const accountsNote = accounts.length > 0
                ? `      # Lambda deployed to all org accounts. Tagging scoped to: ${accounts.map(a => a.id + (a.label !== a.id ? ' (' + a.label + ')' : '')).join(', ')}`
                : `      # Lambda deployed to all org accounts. Tagging applies to all accounts.`;

            return `# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
AWSTemplateFormatVersion: '2010-09-09'
Description: >
  MAP 2.0 Auto-Tagger for ${config.customerName || 'Customer'} (MPE: ${mpe}).
  Automatically discovers org structure and deploys Lambda to all accounts.
  No OU IDs required. Deploy in the management account.

Parameters:
  MpeId:
    Type: String
    Default: '${mpe}'
    Description: MAP 2.0 MPE ID
  AgreementStartDate:
    Type: String
    Default: '${config.agreementDate}'
    Description: MAP agreement start date (YYYY-MM-DD)
  AgreementEndDate:
    Type: String
    Default: '${config.agreementEndDate}'
    Description: MAP agreement end date (YYYY-MM-DD)
  PerAccountTemplateURL:
    Type: String
    Description: S3 URL of map-auto-tagger-accounts-${mpe}.yaml
  AlertEmail:
    Type: String
    Default: '${config.alertEmail || ''}'
    Description: Customer ops email for tagging failure alerts (leave empty to disable)

Conditions:
  HasAlertEmail: !Not [!Equals [!Ref AlertEmail, '']]

Resources:

  DeployRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: auto-map-tagger-deploy-role-${mpe}
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal: {Service: lambda.amazonaws.com}
            Action: sts:AssumeRole
      Policies:
        - PolicyName: DeployPolicy
          PolicyDocument:
            Version: '2012-10-17'
            Statement:
              - Effect: Allow
                Action:
                  - organizations:ListRoots
                  - organizations:EnableAWSServiceAccess
                  - cloudformation:CreateStackSet
                  - cloudformation:DeleteStackSet
                  - cloudformation:DescribeStackSet
                  - cloudformation:CreateStackInstances
                  - cloudformation:DeleteStackInstances
                  - cloudformation:DescribeStackSetOperation
                  - cloudformation:ListStackSetOperations
                  - cloudformation:ListStackInstances
                  - s3:GetObject
                  - logs:CreateLogGroup
                  - logs:CreateLogStream
                  - logs:PutLogEvents
                Resource: '*'

  DeployFunction:
    Type: AWS::Lambda::Function
    DependsOn: DeployRole
    Properties:
      FunctionName: auto-map-tagger-deploy-fn-${mpe}
      Runtime: python3.12
      Handler: index.handler
      Role: !GetAtt DeployRole.Arn
      Timeout: 900
      Code:
        ZipFile: |
          import boto3, json, time, urllib.request
          def respond(event, context, status, data={}, reason=''):
              body = json.dumps({'Status': status, 'Reason': reason,
                  'PhysicalResourceId': event.get('PhysicalResourceId','Deploy'),
                  'StackId': event['StackId'], 'RequestId': event['RequestId'],
                  'LogicalResourceId': event['LogicalResourceId'], 'Data': data}).encode()
              req = urllib.request.Request(event['ResponseURL'], data=body,
                  headers={'Content-Type': ''}, method='PUT')
              urllib.request.urlopen(req)
          def handler(event, context):
              time.sleep(15)
              props = event.get('ResourceProperties', {})
              cf = boto3.client('cloudformation')
              stackset_name = props['StackSetName']
              if event['RequestType'] == 'Delete':
                  try:
                      org = boto3.client('organizations', region_name='us-east-1')
                      root_id = org.list_roots()['Roots'][0]['Id']
                      cf.delete_stack_instances(StackSetName=stackset_name,
                          DeploymentTargets={'OrganizationalUnitIds': [root_id]},
                          Regions=props.get('Regions', ['ap-northeast-2']),
                          RetainStacks=False,
                          OperationPreferences={
                              'MaxConcurrentPercentage': 100,
                              'FailureTolerancePercentage': 100,
                              'RegionConcurrencyType': 'PARALLEL',
                          })
                      time.sleep(90)
                      cf.delete_stack_set(StackSetName=stackset_name)
                  except Exception as e:
                      print('Delete cleanup:', e)
                  respond(event, context, 'SUCCESS')
                  return
              try:
                  org = None
                  for attempt in range(5):
                      try:
                          org = boto3.client('organizations', region_name='us-east-1')
                          org.list_roots()  # test credentials
                          break
                      except Exception as e:
                          if 'security token' in str(e).lower() or 'InvalidClientToken' in str(e) or 'UnrecognizedClient' in str(e):
                              print(f'Credential propagation wait (attempt {attempt+1}): {e}')
                              time.sleep(10)
                          else:
                              raise
                  try:
                      org.enable_aws_service_access(ServicePrincipal='stacksets.cloudformation.amazonaws.com')
                      print('StackSets service access enabled')
                  except Exception as e:
                      print('Service access already enabled or skipped:', e)
                  root_id = org.list_roots()['Roots'][0]['Id']
                  print('Root OU:', root_id)
                  # StackSet deploys Lambda to all org accounts.
                  # Account-level filtering is handled by scoped_account_ids in Lambda config.
                  targets = {'OrganizationalUnitIds': [root_id]}
                  s3 = boto3.client('s3')
                  url = props['TemplateURL']
                  bkt = url.split('.s3.')[0].replace('https://','')
                  key = url.split('.amazonaws.com/')[-1].split('?')[0]
                  print('Fetching template:', bkt, key)
                  body = s3.get_object(Bucket=bkt, Key=key)['Body'].read().decode()
                  print('Template bytes:', len(body))
                  # AutoDeployment always enabled. The Lambda deploys to every
                  # account in the org but defers to the SSM scope parameter at
                  # runtime — out-of-scope accounts no-op in ~100ms with negligible
                  # cost. This ensures new accounts joining the OU are pre-wired;
                  # customers add them to scope via update.sh when ready.
                  auto_deploy = True
                  scoped = json.loads(props.get('ScopedAccounts', '["ALL"]'))
                  print(f'AutoDeployment={auto_deploy} (scoped_accounts={scoped})')
                  try:
                      cf.create_stack_set(StackSetName=stackset_name,
                          Description='MAP 2.0 Auto-Tagger',
                          TemplateBody=body,
                          Parameters=[
                              {'ParameterKey':'MpeId','ParameterValue':props['MpeId']},
                              {'ParameterKey':'AgreementStartDate','ParameterValue':props['AgreementStartDate']},
                              {'ParameterKey':'AgreementEndDate','ParameterValue':props['AgreementEndDate']},
                              {'ParameterKey':'ScopeMode','ParameterValue':'account'},
                              {'ParameterKey':'CentralAlertTopicArn','ParameterValue':props.get('CentralAlertTopicArn','')},
                          ],
                          Capabilities=['CAPABILITY_NAMED_IAM'],
                          PermissionModel='SERVICE_MANAGED',
                          AutoDeployment={'Enabled': True, 'RetainStacksOnAccountRemoval': False})
                      print('StackSet created')
                  except cf.exceptions.NameAlreadyExistsException:
                      print('StackSet already exists')
                  try:
                      # Parallel deployment across all accounts. Per-account Lambdas are
                      # independent (no cross-account runtime deps), so 100/100 is safe:
                      # deploy everywhere in parallel, recover partial failures by re-running
                      # deploy.sh (CFN sees existing stacks and no-ops). Without this, AWS
                      # defaults to MaxConcurrentCount=1 — a 500-account customer waits hours.
                      op = cf.create_stack_instances(StackSetName=stackset_name,
                          DeploymentTargets=targets,
                          Regions=props.get('Regions', ['ap-northeast-2']),
                          OperationPreferences={
                              'MaxConcurrentPercentage': 100,
                              'FailureTolerancePercentage': 100,
                              'RegionConcurrencyType': 'PARALLEL',
                          })
                      print('Op:', op['OperationId'])
                  except cf.exceptions.OperationInProgressException:
                      print('OperationInProgress — responding SUCCESS to let deploy.sh poll')
                  respond(event, context, 'SUCCESS', {'StackSetName': stackset_name, 'RootId': root_id})
              except Exception as e:
                  import traceback
                  print(traceback.format_exc())
                  respond(event, context, 'FAILED', reason=str(e))

  CentralAlertTopic:
    Type: AWS::SNS::Topic
    Properties:
      TopicName: auto-map-tagger-alerts-${mpe}
      DisplayName: MAP 2.0 Auto-Tagger Alerts (central)

  CentralAlertTopicPolicy:
    Type: AWS::SNS::TopicPolicy
    Properties:
      Topics:
        - !Ref CentralAlertTopic
      PolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Sid: AllowCloudWatchAlarmsPublish
            Effect: Allow
            Principal:
              Service: cloudwatch.amazonaws.com
            Action: sns:Publish
            Resource: !Ref CentralAlertTopic

  CentralAlertSubscription:
    Type: AWS::SNS::Subscription
    Condition: HasAlertEmail
    Properties:
      TopicArn: !Ref CentralAlertTopic
      Protocol: email
      Endpoint: !Ref AlertEmail

  Deployment:
    Type: Custom::Deploy
    DependsOn: DeployFunction
    Properties:
      ServiceToken: !GetAtt DeployFunction.Arn
      StackSetName: map-auto-tagger-${mpe}
      TemplateURL: !Ref PerAccountTemplateURL
      MpeId: !Ref MpeId
      AgreementStartDate: !Ref AgreementStartDate
      AgreementEndDate: !Ref AgreementEndDate
      ScopedAccounts: '${scopedAccountIdsJson}'
      CentralAlertTopicArn: !Ref CentralAlertTopic
      Regions:
${regionsList}
${accountsNote}

Outputs:
  StackSetName:
    Value: !GetAtt Deployment.StackSetName
  RootOU:
    Value: !GetAtt Deployment.RootId
  CentralAlertTopicArn:
    Value: !Ref CentralAlertTopic`;
        }

