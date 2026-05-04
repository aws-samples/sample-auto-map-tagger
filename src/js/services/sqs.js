const SERVICE_SQS = {
    source: 'aws.sqs',
    events: ['CreateQueue'],
    permissions: ['sqs:TagQueue'],
};

