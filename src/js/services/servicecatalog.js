const SERVICE_SERVICECATALOG = {
    source: 'aws.servicecatalog',
    events: ['CreatePortfolio'],
    permissions: ['servicecatalog:TagResource', 'servicecatalog:UpdatePortfolio', 'servicecatalog:UpdateProduct'],
};

