const SERVICE_COMPREHEND = {
    source: 'aws.comprehend',
    events: ['CreateDocumentClassifier', 'CreateEntityRecognizer'],
    permissions: ['comprehend:TagResource'],
};

