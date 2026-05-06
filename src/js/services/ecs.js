const SERVICE_ECS = {
    source: 'aws.ecs',
    events: ['CreateCluster', 'CreateService', 'RunTask'],
    permissions: ['ecs:TagResource'],
};

