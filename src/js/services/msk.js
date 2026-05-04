const SERVICE_MSK = {
    source: 'aws.kafka',
    events: ['CreateCluster', 'CreateClusterV2'],
    permissions: ['kafka:TagResource'],
};

