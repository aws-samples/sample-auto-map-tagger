const SERVICE_ROUTE53 = {
    source: 'aws.route53',
    events: ['CreateHostedZone', 'CreateHealthCheck'],
    permissions: ['route53:ChangeTagsForResource'],
};

