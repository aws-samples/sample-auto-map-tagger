const SERVICE_DIRECTCONNECT = {
    source: 'aws.directconnect',
    events: ['CreateConnection', 'CreateLag', 'CreateDirectConnectGateway'],
    permissions: ['directconnect:TagResource'],
};

