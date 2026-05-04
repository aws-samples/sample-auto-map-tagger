const SERVICE_NETWORKMANAGER = {
    source: 'aws.networkmanager',
    events: ['CreateCoreNetwork', 'CreateGlobalNetwork'],
    permissions: ['networkmanager:TagResource'],
};

