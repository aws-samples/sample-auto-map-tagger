const SERVICE_BEDROCK = {
    source: 'aws.bedrock',
    events: [
        'CreateInferenceProfile', 'CreateModelCustomizationJob', 'CreateGuardrail',
        'CreateFlow', 'CreatePrompt', 'CreateProvisionedModelThroughput',
        'CreateModelImportJob', 'CreateModelInvocationJob',
        'CreateEvaluationJob', 'CreatePromptRouter',
    ],
    permissions: ['bedrock:TagResource'],
};

const SERVICE_BEDROCK_AGENT = {
    source: 'aws.bedrock-agent',
    events: [
        'CreateAgent', 'CreateKnowledgeBase', 'CreateAgentAlias',
        'CreateDataSource', 'CreateAgentActionGroup',
        'CreateMemory', 'CreateAgentRuntime',
    ],
    permissions: [],
};

const SERVICE_BEDROCK_AGENTCORE = {
    source: 'aws.bedrock-agentcore',
    events: [],
    permissions: ['bedrock-agentcore:TagResource'],
};

