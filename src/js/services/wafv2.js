const SERVICE_WAFV2 = {
    source: 'aws.wafv2',
    events: ['CreateWebACL', 'CreateIPSet'],
    permissions: ['wafv2:TagResource'],
};

