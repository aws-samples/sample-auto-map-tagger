const SERVICE_CLOUDHSM = {
    source: 'aws.cloudhsm',
    events: ['CreateCluster', 'CreateHsm'],
    permissions: ['cloudhsm:TagResource'],
};

