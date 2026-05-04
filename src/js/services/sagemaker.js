const SERVICE_SAGEMAKER = {
    source: 'aws.sagemaker',
    events: [
        'CreateNotebookInstance', 'CreateEndpoint', 'CreateTrainingJob',
        'CreateProcessingJob', 'CreateTransformJob', 'CreateModel',
        'CreateEndpointConfig', 'CreateDomain', 'CreatePipeline',
    ],
    permissions: ['sagemaker:AddTags'],
};

