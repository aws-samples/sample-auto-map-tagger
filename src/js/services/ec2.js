const SERVICE_EC2 = {
    source: 'aws.ec2',
    events: [
        'RunInstances', 'CreateVolume', 'CreateSnapshot', 'CopySnapshot',
        'CreateImage', 'CopyImage', 'ImportImage', 'ImportSnapshot',
        'CreateCapacityReservation', 'RunScheduledInstances',
        'CreateVpc', 'CreateSubnet', 'CreateNatGateway',
        'CreateTransitGateway', 'CreateTransitGatewayVpcAttachment',
        'CreateVpcEndpoint', 'AllocateAddress', 'CreateClientVpnEndpoint',
        'CreateVpnGateway', 'CreateVpnConnection',
        'CreateSecurityGroup', 'CreateInternetGateway', 'CreateRouteTable',
        'CreateNetworkAcl', 'CreateNetworkInterface', 'CreateDhcpOptions',
        'CreatePlacementGroup', 'CreateEgressOnlyInternetGateway',
        'CreateCustomerGateway', 'CreateCarrierGateway', 'CreateKeyPair',
        'CreateVpcPeeringConnection', 'CreateLaunchTemplate',
        'CreateFlowLogs', 'CreateSnapshots',
    ],
    permissions: ['ec2:CreateTags'],
};

