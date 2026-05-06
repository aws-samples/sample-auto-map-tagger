const SERVICE_KMS = {
    source: 'aws.kms',
    events: ['CreateKey'],
    permissions: ['kms:TagResource'],
};

