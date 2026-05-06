const SERVICE_REDSHIFT = {
    source: 'aws.redshift',
    events: ['CreateCluster', 'CreateClusterSnapshot', 'RestoreFromClusterSnapshot'],
    permissions: ['redshift:CreateTags'],
};

