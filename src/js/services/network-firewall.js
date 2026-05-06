const SERVICE_NETWORKFIREWALL = {
    source: 'aws.network-firewall',
    events: ['CreateFirewall', 'CreateFirewallPolicy'],
    permissions: ['network-firewall:TagResource'],
};

