const SERVICE_ECR = {
    source: 'aws.ecr',
    events: ['CreateRepository'],
    permissions: ['ecr:TagResource'],
};

