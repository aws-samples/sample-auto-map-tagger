const SERVICE_SECRETSMANAGER = {
    source: 'aws.secretsmanager',
    events: ['CreateSecret'],
    permissions: ['secretsmanager:TagResource'],
};

