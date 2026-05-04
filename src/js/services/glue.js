const SERVICE_GLUE = {
    source: 'aws.glue',
    events: [
        'CreateJob', 'CreateCrawler', 'CreateDatabase',
        'CreateWorkflow', 'CreateTrigger', 'CreateDataset', 'CreateRecipe',
    ],
    permissions: ['glue:TagResource', 'glue:GetDatabase'],
};

