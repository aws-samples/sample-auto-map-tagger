const SERVICE_APIGATEWAY = {
    source: 'aws.apigateway',
    events: ['CreateRestApi', 'CreateApi', 'CreateVpcLink', 'CreateApiKey'],
    permissions: ['apigateway:TagResource', 'apigateway:PUT', 'apigateway:PATCH', 'apigateway:POST'],
};

