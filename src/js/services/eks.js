const SERVICE_EKS = {
    source: 'aws.eks',
    events: ['CreateCluster', 'CreateNodegroup', 'CreateFargateProfile', 'CreateAddon'],
    permissions: ['eks:TagResource'],
};

