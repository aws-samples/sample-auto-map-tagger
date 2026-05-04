const SERVICE_LOGS = {
    source: 'aws.logs',
    events: ['CreateLogGroup', 'PutQueryDefinition'],
    permissions: ['logs:TagResource'],
};

