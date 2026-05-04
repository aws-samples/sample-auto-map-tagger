const SERVICE_TRANSFER = {
    source: 'aws.transfer',
    events: ['CreateServer', 'CreateConnector', 'CreateUser'],
    permissions: ['transfer:TagResource'],
};

