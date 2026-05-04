const SERVICE_CLOUDFRONT = {
    source: 'aws.cloudfront',
    events: ['CreateDistribution'],
    permissions: ['cloudfront:TagResource'],
};

