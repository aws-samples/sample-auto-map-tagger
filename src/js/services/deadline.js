const SERVICE_DEADLINE = {
    source: 'aws.deadline',
    events: ['CreateFarm', 'CreateQueue'],
    permissions: ['deadline:TagResource'],
};

