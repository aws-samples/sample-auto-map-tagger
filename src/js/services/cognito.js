const SERVICE_COGNITO_IDP = {
    source: 'aws.cognito-idp',
    events: ['CreateUserPool'],
    permissions: ['cognito-idp:TagResource'],
};

const SERVICE_COGNITO_IDENTITY = {
    source: 'aws.cognito-identity',
    events: ['CreateIdentityPool'],
    permissions: ['cognito-identity:TagResource'],
};

