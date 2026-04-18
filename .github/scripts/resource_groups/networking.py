"""
networking.py — Creates all VPC/networking resources for the E2E test.

Creates (in dependency order):
  1.  VPC
  2.  Subnet A (10.0.1.0/24, ap-northeast-2a)
  3.  Subnet B (10.0.2.0/24, ap-northeast-2b)
  4.  Internet Gateway + attach
  5.  Route Table
  6.  Network ACL
  7.  DHCP Options Set
  8.  Security Group
  9.  Elastic IP
  10. NAT Gateway (in Subnet A, uses EIP) — no wait
  11. VPC Peering Connection (self-peering)
  12. Transit Gateway — no wait
  13. VPC Endpoint (Gateway, S3)
  14. VPC Flow Logs (to CloudWatch Logs)
  15. Customer Gateway
  16. VPN Gateway
  17. Egress-Only Internet Gateway
  18. Network Interface (in Subnet A)
  19. Placement Group
  20. Launch Template
  21. Classic ELB (v1, CLB)
  22. Application Load Balancer (v2) + Target Group
  23. Site-to-Site VPN Connection (uses CGW + VGW from above)

Returns:
  arns   — list of ARN records
  outputs — {vpc-id, subnet-ids, sg-id}
"""

from __future__ import annotations

import logging

import boto3

from ._common import get_account_id, make_record, resource_name, safe_call

log = logging.getLogger(__name__)

# Tag key used to mark E2E-created resources for teardown bookkeeping.
# NOT `map-migrated` — that is the tag the auto-tagger Lambda is supposed
# to apply; pre-tagging with it would make verify_tags a tautology and
# mask any Lambda failure (see auto-map-tagger-e2e-audit.md).
PRE_TAG_KEY = "e2e-run-id"

# Tag key the Lambda is expected to apply — what verify_tags polls for.
EXPECTED_TAG_KEY = "map-migrated"


def create(
    region: str,
    pr_number: str,
    timestamp: str,
    tag_value: str,
    **_kwargs,
) -> dict:
    ec2 = boto3.client("ec2", region_name=region)
    logs = boto3.client("logs", region_name=region)
    elb = boto3.client("elb", region_name=region)
    elbv2 = boto3.client("elbv2", region_name=region)
    account = get_account_id()

    arns: list[dict] = []
    prefix = lambda svc: resource_name(pr_number, timestamp, svc)

    # Helper: tag a resource by ID
    def tag(resource_id: str) -> None:
        safe_call(
            ec2.create_tags,
            Resources=[resource_id],
            Tags=[{"Key": PRE_TAG_KEY, "Value": tag_value}],
        )

    def rec(arn, service, resource_id, taggable=True):
        arns.append(make_record(
            arn=arn,
            service=service,
            region=region,
            account=account,
            resource_id=resource_id,
            tag_key=EXPECTED_TAG_KEY,
            tag_value=tag_value,
            taggable=taggable,
        ))

    # ── 1. VPC ───────────────────────────────────────────────────────────────
    vpc_id = None
    try:
        resp = ec2.create_vpc(CidrBlock="10.0.0.0/16")
        vpc_id = resp["Vpc"]["VpcId"]
        tag(vpc_id)
        rec(f"arn:aws:ec2:{region}:{account}:vpc/{vpc_id}", "ec2", vpc_id)
        log.info("VPC: %s", vpc_id)
    except Exception as exc:
        log.error("VPC creation failed: %s", exc)
        return {"arns": arns, "outputs": {}}

    # ── 2. Subnet A ──────────────────────────────────────────────────────────
    subnet_a_id = None
    try:
        resp = ec2.create_subnet(
            VpcId=vpc_id,
            CidrBlock="10.0.1.0/24",
            AvailabilityZone=f"{region}a",
        )
        subnet_a_id = resp["Subnet"]["SubnetId"]
        tag(subnet_a_id)
        rec(f"arn:aws:ec2:{region}:{account}:subnet/{subnet_a_id}", "ec2", subnet_a_id)
        log.info("Subnet A: %s", subnet_a_id)
    except Exception as exc:
        log.error("Subnet A creation failed: %s", exc)

    # ── 3. Subnet B ──────────────────────────────────────────────────────────
    subnet_b_id = None
    try:
        resp = ec2.create_subnet(
            VpcId=vpc_id,
            CidrBlock="10.0.2.0/24",
            AvailabilityZone=f"{region}b",
        )
        subnet_b_id = resp["Subnet"]["SubnetId"]
        tag(subnet_b_id)
        rec(f"arn:aws:ec2:{region}:{account}:subnet/{subnet_b_id}", "ec2", subnet_b_id)
        log.info("Subnet B: %s", subnet_b_id)
    except Exception as exc:
        log.error("Subnet B creation failed: %s", exc)

    # ── 4. Internet Gateway ───────────────────────────────────────────────────
    igw_id = None
    try:
        resp = ec2.create_internet_gateway()
        igw_id = resp["InternetGateway"]["InternetGatewayId"]
        tag(igw_id)
        safe_call(ec2.attach_internet_gateway, InternetGatewayId=igw_id, VpcId=vpc_id)
        rec(f"arn:aws:ec2:{region}:{account}:internet-gateway/{igw_id}", "ec2", igw_id)
        log.info("IGW: %s", igw_id)
    except Exception as exc:
        log.error("IGW creation failed: %s", exc)

    # ── 5. Route Table ────────────────────────────────────────────────────────
    try:
        resp = ec2.create_route_table(VpcId=vpc_id)
        rt_id = resp["RouteTable"]["RouteTableId"]
        tag(rt_id)
        rec(f"arn:aws:ec2:{region}:{account}:route-table/{rt_id}", "ec2", rt_id)
        log.info("Route Table: %s", rt_id)
    except Exception as exc:
        log.error("Route Table creation failed: %s", exc)

    # ── 6. Network ACL ────────────────────────────────────────────────────────
    try:
        resp = ec2.create_network_acl(VpcId=vpc_id)
        nacl_id = resp["NetworkAcl"]["NetworkAclId"]
        tag(nacl_id)
        rec(f"arn:aws:ec2:{region}:{account}:network-acl/{nacl_id}", "ec2", nacl_id)
        log.info("Network ACL: %s", nacl_id)
    except Exception as exc:
        log.error("Network ACL creation failed: %s", exc)

    # ── 7. DHCP Options Set ───────────────────────────────────────────────────
    try:
        resp = ec2.create_dhcp_options(
            DhcpConfigurations=[
                {"Key": "domain-name", "Values": [f"{region}.compute.internal"]},
                {"Key": "domain-name-servers", "Values": ["AmazonProvidedDNS"]},
            ]
        )
        dhcp_id = resp["DhcpOptions"]["DhcpOptionsId"]
        tag(dhcp_id)
        rec(f"arn:aws:ec2:{region}:{account}:dhcp-options/{dhcp_id}", "ec2", dhcp_id)
        log.info("DHCP Options: %s", dhcp_id)
    except Exception as exc:
        log.error("DHCP Options creation failed: %s", exc)

    # ── 8. Security Group ─────────────────────────────────────────────────────
    sg_id = None
    try:
        sg_name = prefix("sg")
        resp = ec2.create_security_group(
            GroupName=sg_name,
            Description="E2E test security group — allow all egress",
            VpcId=vpc_id,
        )
        sg_id = resp["GroupId"]
        tag(sg_id)
        # Allow all egress
        safe_call(
            ec2.authorize_security_group_egress,
            GroupId=sg_id,
            IpPermissions=[{
                "IpProtocol": "-1",
                "IpRanges": [{"CidrIp": "0.0.0.0/0"}],
            }],
        )
        rec(f"arn:aws:ec2:{region}:{account}:security-group/{sg_id}", "ec2", sg_id)
        log.info("Security Group: %s", sg_id)
    except Exception as exc:
        log.error("Security Group creation failed: %s", exc)

    # ── 9. Elastic IP ─────────────────────────────────────────────────────────
    eip_alloc_id = None
    try:
        resp = ec2.allocate_address(Domain="vpc")
        eip_alloc_id = resp["AllocationId"]
        eip_arn = f"arn:aws:ec2:{region}:{account}:elastic-ip/{eip_alloc_id}"
        tag(eip_alloc_id)
        rec(eip_arn, "ec2", eip_alloc_id)
        log.info("EIP: %s", eip_alloc_id)
    except Exception as exc:
        log.error("EIP allocation failed: %s", exc)

    # ── 10. NAT Gateway ────────────────────────────────────────────────────────
    if subnet_a_id and eip_alloc_id:
        try:
            resp = ec2.create_nat_gateway(
                SubnetId=subnet_a_id,
                AllocationId=eip_alloc_id,
                TagSpecifications=[{
                    "ResourceType": "natgateway",
                    "Tags": [{"Key": PRE_TAG_KEY, "Value": tag_value}],
                }],
            )
            nat_id = resp["NatGateway"]["NatGatewayId"]
            # Don't wait for available — record and move on
            rec(f"arn:aws:ec2:{region}:{account}:natgateway/{nat_id}", "ec2", nat_id)
            log.info("NAT Gateway: %s (not waiting for available)", nat_id)
        except Exception as exc:
            log.error("NAT Gateway creation failed: %s", exc)

    # ── 11. VPC Peering Connection (self-peering) ─────────────────────────────
    try:
        resp = ec2.create_vpc_peering_connection(
            VpcId=vpc_id,
            PeerVpcId=vpc_id,
            PeerOwnerId=account,
            PeerRegion=region,
        )
        pcx_id = resp["VpcPeeringConnection"]["VpcPeeringConnectionId"]
        tag(pcx_id)
        # Accept immediately (same account/region)
        safe_call(ec2.accept_vpc_peering_connection, VpcPeeringConnectionId=pcx_id)
        rec(f"arn:aws:ec2:{region}:{account}:vpc-peering-connection/{pcx_id}", "ec2", pcx_id)
        log.info("VPC Peering: %s", pcx_id)
    except Exception as exc:
        log.error("VPC Peering creation failed: %s", exc)

    # ── 12. Transit Gateway ───────────────────────────────────────────────────
    try:
        resp = ec2.create_transit_gateway(
            Description="E2E test transit gateway",
            Options={
                "DefaultRouteTableAssociation": "disable",
                "DefaultRouteTablePropagation": "disable",
            },
            TagSpecifications=[{
                "ResourceType": "transit-gateway",
                "Tags": [{"Key": PRE_TAG_KEY, "Value": tag_value}],
            }],
        )
        tgw_id = resp["TransitGateway"]["TransitGatewayId"]
        tgw_arn = resp["TransitGateway"]["TransitGatewayArn"]
        # Don't wait — can take several minutes
        rec(tgw_arn, "ec2", tgw_id)
        log.info("Transit Gateway: %s (not waiting)", tgw_id)
    except Exception as exc:
        log.error("Transit Gateway creation failed: %s", exc)

    # ── 13. VPC Endpoint (Gateway, S3) ────────────────────────────────────────
    try:
        resp = ec2.create_vpc_endpoint(
            VpcEndpointType="Gateway",
            VpcId=vpc_id,
            ServiceName=f"com.amazonaws.{region}.s3",
            TagSpecifications=[{
                "ResourceType": "vpc-endpoint",
                "Tags": [{"Key": PRE_TAG_KEY, "Value": tag_value}],
            }],
        )
        vpce_id = resp["VpcEndpoint"]["VpcEndpointId"]
        rec(f"arn:aws:ec2:{region}:{account}:vpc-endpoint/{vpce_id}", "ec2", vpce_id)
        log.info("VPC Endpoint: %s", vpce_id)
    except Exception as exc:
        log.error("VPC Endpoint creation failed: %s", exc)

    # ── 14. VPC Flow Logs ─────────────────────────────────────────────────────
    try:
        log_group_name = f"/aws/vpc/flowlogs/{prefix('flowlogs')}"
        safe_call(logs.create_log_group, logGroupName=log_group_name)

        # Need IAM role for flow logs
        import json
        iam = boto3.client("iam")
        fl_role_name = prefix("flowlogs-role")
        trust = {
            "Version": "2012-10-17",
            "Statement": [{
                "Effect": "Allow",
                "Principal": {"Service": "vpc-flow-logs.amazonaws.com"},
                "Action": "sts:AssumeRole",
            }],
        }
        try:
            fl_role = iam.create_role(
                RoleName=fl_role_name,
                AssumeRolePolicyDocument=json.dumps(trust),
            )
            fl_role_arn = fl_role["Role"]["Arn"]
            iam.attach_role_policy(
                RoleName=fl_role_name,
                PolicyArn="arn:aws:iam::aws:policy/CloudWatchLogsFullAccess",
            )
        except iam.exceptions.EntityAlreadyExistsException:
            fl_role_arn = f"arn:aws:iam::{account}:role/{fl_role_name}"

        resp = ec2.create_flow_logs(
            ResourceIds=[vpc_id],
            ResourceType="VPC",
            TrafficType="ALL",
            LogDestinationType="cloud-watch-logs",
            LogGroupName=log_group_name,
            DeliverLogsPermissionArn=fl_role_arn,
            TagSpecifications=[{
                "ResourceType": "vpc-flow-log",
                "Tags": [{"Key": PRE_TAG_KEY, "Value": tag_value}],
            }],
        )
        fl_ids = resp.get("FlowLogIds", [])
        for fl_id in fl_ids:
            rec(f"arn:aws:ec2:{region}:{account}:vpc-flow-log/{fl_id}", "ec2", fl_id)
        log.info("Flow Logs: %s", fl_ids)
    except Exception as exc:
        log.error("Flow Logs creation failed: %s", exc)

    # ── 15. Customer Gateway ──────────────────────────────────────────────────
    cgw_id = None
    try:
        resp = ec2.create_customer_gateway(
            BgpAsn=65000,
            PublicIp="1.2.3.4",
            Type="ipsec.1",
            TagSpecifications=[{
                "ResourceType": "customer-gateway",
                "Tags": [{"Key": PRE_TAG_KEY, "Value": tag_value}],
            }],
        )
        cgw_id = resp["CustomerGateway"]["CustomerGatewayId"]
        rec(f"arn:aws:ec2:{region}:{account}:customer-gateway/{cgw_id}", "ec2", cgw_id)
        log.info("Customer Gateway: %s", cgw_id)
    except Exception as exc:
        log.error("Customer Gateway creation failed: %s", exc)

    # ── 16. VPN Gateway ───────────────────────────────────────────────────────
    try:
        resp = ec2.create_vpn_gateway(
            Type="ipsec.1",
            TagSpecifications=[{
                "ResourceType": "vpn-gateway",
                "Tags": [{"Key": PRE_TAG_KEY, "Value": tag_value}],
            }],
        )
        vgw_id = resp["VpnGateway"]["VpnGatewayId"]
        safe_call(ec2.attach_vpn_gateway, VpnGatewayId=vgw_id, VpcId=vpc_id)
        rec(f"arn:aws:ec2:{region}:{account}:vpn-gateway/{vgw_id}", "ec2", vgw_id)
        log.info("VPN Gateway: %s", vgw_id)
    except Exception as exc:
        log.error("VPN Gateway creation failed: %s", exc)

    # ── 17. Egress-Only Internet Gateway ──────────────────────────────────────
    try:
        resp = ec2.create_egress_only_internet_gateway(
            VpcId=vpc_id,
            TagSpecifications=[{
                "ResourceType": "egress-only-internet-gateway",
                "Tags": [{"Key": PRE_TAG_KEY, "Value": tag_value}],
            }],
        )
        eigw_id = resp["EgressOnlyInternetGateway"]["EgressOnlyInternetGatewayId"]
        rec(f"arn:aws:ec2:{region}:{account}:egress-only-internet-gateway/{eigw_id}",
            "ec2", eigw_id)
        log.info("Egress-Only IGW: %s", eigw_id)
    except Exception as exc:
        log.error("Egress-Only IGW creation failed: %s", exc)

    # ── 18. Network Interface ─────────────────────────────────────────────────
    if subnet_a_id and sg_id:
        try:
            resp = ec2.create_network_interface(
                SubnetId=subnet_a_id,
                Groups=[sg_id],
                TagSpecifications=[{
                    "ResourceType": "network-interface",
                    "Tags": [{"Key": PRE_TAG_KEY, "Value": tag_value}],
                }],
            )
            eni_id = resp["NetworkInterface"]["NetworkInterfaceId"]
            rec(f"arn:aws:ec2:{region}:{account}:network-interface/{eni_id}", "ec2", eni_id)
            log.info("Network Interface: %s", eni_id)
        except Exception as exc:
            log.error("Network Interface creation failed: %s", exc)

    # ── 19. Placement Group ───────────────────────────────────────────────────
    pg_name = prefix("pg")
    try:
        ec2.create_placement_group(
            GroupName=pg_name,
            Strategy="cluster",
            TagSpecifications=[{
                "ResourceType": "placement-group",
                "Tags": [{"Key": PRE_TAG_KEY, "Value": tag_value}],
            }],
        )
        rec(f"arn:aws:ec2:{region}:{account}:placement-group/{pg_name}", "ec2", pg_name)
        log.info("Placement Group: %s", pg_name)
    except Exception as exc:
        log.error("Placement Group creation failed: %s", exc)

    # ── 20. Launch Template ───────────────────────────────────────────────────
    lt_name = prefix("lt")
    if subnet_a_id and sg_id:
        try:
            resp = ec2.create_launch_template(
                LaunchTemplateName=lt_name,
                LaunchTemplateData={
                    "InstanceType": "t3.micro",
                    "ImageId": _get_amazon_linux2_ami(ec2),
                    "NetworkInterfaces": [{
                        "DeviceIndex": 0,
                        "SubnetId": subnet_a_id,
                        "Groups": [sg_id],
                        "AssociatePublicIpAddress": False,
                    }],
                    "TagSpecifications": [{
                        "ResourceType": "instance",
                        "Tags": [{"Key": PRE_TAG_KEY, "Value": tag_value}],
                    }],
                },
                TagSpecifications=[{
                    "ResourceType": "launch-template",
                    "Tags": [{"Key": PRE_TAG_KEY, "Value": tag_value}],
                }],
            )
            lt_id = resp["LaunchTemplate"]["LaunchTemplateId"]
            rec(f"arn:aws:ec2:{region}:{account}:launch-template/{lt_id}", "ec2", lt_id)
            log.info("Launch Template: %s", lt_id)
        except Exception as exc:
            log.error("Launch Template creation failed: %s", exc)

    # ── 21. Classic ELB (v1) ──────────────────────────────────────────────────
    # CloudTrail event: CreateLoadBalancer [elasticloadbalancing.amazonaws.com]
    # (ARN synthesised from loadBalancerName — v1 response omits ARN.)
    clb_name = prefix("clb")[:32]  # CLB name max length 32
    if subnet_a_id and sg_id:
        try:
            elb.create_load_balancer(
                LoadBalancerName=clb_name,
                Listeners=[{
                    "Protocol": "HTTP",
                    "LoadBalancerPort": 80,
                    "InstanceProtocol": "HTTP",
                    "InstancePort": 80,
                }],
                Subnets=[subnet_a_id],
                SecurityGroups=[sg_id],
                Tags=[{"Key": PRE_TAG_KEY, "Value": tag_value}],
            )
            clb_arn = f"arn:aws:elasticloadbalancing:{region}:{account}:loadbalancer/{clb_name}"
            rec(clb_arn, "elasticloadbalancing", clb_name)
            log.info("Classic ELB: %s", clb_name)
        except Exception as exc:
            log.error("Classic ELB creation failed: %s", exc)

    # ── 22. Application Load Balancer (v2) + Target Group ─────────────────────
    # CloudTrail events: CreateLoadBalancer, CreateTargetGroup
    if subnet_a_id and subnet_b_id and sg_id and vpc_id:
        try:
            resp = elbv2.create_load_balancer(
                Name=prefix("alb")[:32],
                Subnets=[subnet_a_id, subnet_b_id],
                SecurityGroups=[sg_id],
                Scheme="internal",  # internal so no public IP requirement
                Type="application",
                IpAddressType="ipv4",
                Tags=[{"Key": PRE_TAG_KEY, "Value": tag_value}],
            )
            alb_arn = resp["LoadBalancers"][0]["LoadBalancerArn"]
            rec(alb_arn, "elasticloadbalancing", alb_arn.split("/")[-1])
            log.info("ALB: %s", alb_arn)
        except Exception as exc:
            log.error("ALB creation failed: %s", exc)

        try:
            resp = elbv2.create_target_group(
                Name=prefix("tg")[:32],
                Protocol="HTTP",
                Port=80,
                VpcId=vpc_id,
                TargetType="ip",
                Tags=[{"Key": PRE_TAG_KEY, "Value": tag_value}],
            )
            tg_arn = resp["TargetGroups"][0]["TargetGroupArn"]
            rec(tg_arn, "elasticloadbalancing", tg_arn.split("/")[-1])
            log.info("Target Group: %s", tg_arn)
        except Exception as exc:
            log.error("Target Group creation failed: %s", exc)

    # ── 23. Site-to-Site VPN Connection ───────────────────────────────────────
    # CloudTrail event: CreateVpnConnection
    # Requires CustomerGateway + VpnGateway from steps 15, 16.
    if cgw_id:
        # Re-read VGW ID from the records list (we didn't keep it in a local).
        vgw_id = None
        for r in arns:
            if "vpn-gateway/" in r["arn"]:
                vgw_id = r["arn"].split("/")[-1]
                break
        if vgw_id:
            try:
                resp = ec2.create_vpn_connection(
                    Type="ipsec.1",
                    CustomerGatewayId=cgw_id,
                    VpnGatewayId=vgw_id,
                    Options={"StaticRoutesOnly": True},
                    TagSpecifications=[{
                        "ResourceType": "vpn-connection",
                        "Tags": [{"Key": PRE_TAG_KEY, "Value": tag_value}],
                    }],
                )
                vpn_id = resp["VpnConnection"]["VpnConnectionId"]
                rec(f"arn:aws:ec2:{region}:{account}:vpn-connection/{vpn_id}",
                    "ec2", vpn_id)
                log.info("VPN Connection: %s", vpn_id)
            except Exception as exc:
                log.error("VPN Connection creation failed: %s", exc)

    # Build subnet-ids string for output
    subnet_ids_out = ",".join(x for x in [subnet_a_id, subnet_b_id] if x)

    return {
        "arns": arns,
        "outputs": {
            "vpc-id": vpc_id or "",
            "subnet-ids": subnet_ids_out,
            "sg-id": sg_id or "",
        },
    }


def _get_amazon_linux2_ami(ec2_client) -> str:
    """Return the latest Amazon Linux 2 AMI, or a placeholder if lookup fails."""
    try:
        import boto3
        ssm = boto3.client("ssm", region_name=ec2_client.meta.region_name)
        resp = ssm.get_parameter(
            Name="/aws/service/ami-amazon-linux-latest/amzn2-ami-hvm-x86_64-gp2"
        )
        return resp["Parameter"]["Value"]
    except Exception as exc:
        log.warning("AMI lookup failed: %s", exc)
        return "ami-00000000000000000"  # placeholder — won't be launched
