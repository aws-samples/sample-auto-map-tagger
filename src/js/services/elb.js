const SERVICE_ELB = {
    source: 'aws.elasticloadbalancing',
    events: ['CreateLoadBalancer', 'CreateTargetGroup'],
    permissions: ['elasticloadbalancing:AddTags'],
};

