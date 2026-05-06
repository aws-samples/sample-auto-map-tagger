const SERVICE_STEPFUNCTIONS = {
    source: 'aws.states',
    events: ['CreateStateMachine', 'CreateActivity'],
    permissions: ['states:TagResource'],
};

