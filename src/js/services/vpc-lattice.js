const SERVICE_VPCLATTICE = {
    source: 'aws.vpc-lattice',
    events: ['CreateServiceNetwork', 'CreateService'],
    permissions: ['vpc-lattice:TagResource'],
};

