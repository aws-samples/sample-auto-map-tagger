const SERVICE_ELASTICACHE = {
    source: 'aws.elasticache',
    events: ['CreateCacheCluster', 'CreateReplicationGroup', 'CreateServerlessCache'],
    permissions: ['elasticache:AddTagsToResource'],
};

