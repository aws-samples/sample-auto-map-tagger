const SERVICE_KEYSPACES = {
    source: 'aws.cassandra',
    events: ['CreateKeyspace'],
    permissions: ['cassandra:TagResource', 'cassandra:Alter'],
};

