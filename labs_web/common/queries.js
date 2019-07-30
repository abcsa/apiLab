'use strict';

let helper = require('../common/helper.js');

function _getUserDataQuery_v1 (user) {
	
	let query = [];
	
	//restrict info to this user only
	query.push({$match: { 'user':  user }});
	
	query.push({$project: {
			user: {
				code: '$user',
				mail: '$mail',
				name: '$name',
				type: '$type',
				isDeleted: '$isDeleted',
				isActive: {$cond: [ {$eq : ['$isActive', false]}, false, true]}
			}
		}});
	
	//Add helper date items for today and last month.
	query.push({$addFields: {
			currentDate:    new Date(),
			lastMonthDate:  new Date(new Date().setDate(0)),
		}});
	
	//Get the properties (farms, owners and sdl)
	query.push({$lookup: {
			from: 'properties',
			let: {ref: '$user'},
			pipeline: [
				
				{$match: { $expr: {$or: [
								{$and: [ {$eq: ['$$ref.type', 0]}, {$eq: ['$$ref.code', {$substr: ['$code', 0, -1]}]}]},
								{$and: [ {$eq: ['$$ref.type', 1]}, {$eq: ['$$ref.code', {$substr: ['$sdl', 0, -1]} ]}]},
								{$and: [ {$eq: ['$$ref.type', 2]}  ]},
							]}
					}},
				
				//Ensure the SDL is string (this was causing a bug that would not show the propertie when SDL is numeric)
				{$project: {
						category: '$category',
						farm: '$farm',
						city: '$city',
						code: {$substr: ['$code', 0, -1]},
						ie: '$ie',
						sdl: {$substr: ['$sdl', 0, -1]},
						company: '$company',
						factory: '$factory',
						
						macrodescription: '$macrodescription',
						macroregion: '$macroregion',
					}},
				
				//Locate the owner of the farm (among the users)
				{$lookup: {from: 'users', localField : 'code', foreignField: 'user', as: 'owner' }},
				{$unwind: '$owner'},
				
				//------------------------------------------------------------------------------------------------------------------
				//Prepare the milkQualityRecent
				
				//------------------------------------------------------------------------------------------------------------------
				//Prepare the milkQualitySummary
				
				//------------------------------------------------------------------------------------------------------------------
				//Add the milkQualityAverage fields
				
				//------------------------------------------------------------------------------------------------------------------
				//Prepare the milkPriceAverage
				
				//------------------------------------------------------------------------------------------------------------------
				//Prepare the milkVolumeAverage
				
				//------------------------------------------------------------------------------------------------------------------
				//Locate the SDL of the farm (among the users)
				{$lookup: {from: 'users', localField : 'sdl', foreignField: 'user', as: 'sdl' }},
				{$unwind: '$sdl'},
				
				{$project: {
						category: '$category',
						farm: '$farm',
						ie: '$ie',
						city: '$city',
						company: '$company',
						factory: '$factory',
						macrodescription: '$macrodescription',
						macroregion: '$macroregion',
						
						milkQualityRecent:  {$cond: [ {$eq: [ '$$ref.type', 1] }, {$arrayElemAt: ['$milkQualityRecent', 0]}, '$$REMOVE' ]},
						milkQualitySummary: {$cond: [ {$eq: [ '$$ref.type', 1] }, '$milkQualitySummary',                     '$$REMOVE' ]},
						milkQualityAverage: {$cond: [ {$eq: [ '$$ref.type', 1] }, '$milkQualityAverage',                     '$$REMOVE' ]},
						milkVolumeAverage:  {$cond: [ {$eq: [ '$$ref.type', 1] }, '$milkVolumeSummary.volume',               '$$REMOVE' ]},
						milkPriceAverage:   {$cond: [ {$eq: [ '$$ref.type', 1] }, '$milkPriceSummary',                       '$$REMOVE' ]},
						
						producer: {$cond: [
								{$eq: [ '$$ref.type', 1] },
								{
									user: '$owner.user',
									name: '$owner.name',
									email: '$owner.mail',
									isActive: {$ne: ['$owner.isActive', false]}
								},
								'$$REMOVE'
							]},
						sdl: {$cond: [
								{$eq: [ '$$ref.type', 0] },
								{
									user: '$sdl.user',
									name: '$sdl.name',
									email: '$sdl.mail',
									isActive: {$ne: ['$sdl.isActive', false]}
								},
								'$$REMOVE'
							]},
					}}
			],
			as: 'properties'
		}});
	
	//------------------------------------------------------------------------------------------------------------------
	//Prepare the MilkPrice info (monthly)
	query.push({$lookup: {
			from: 'milkPrice',
			let: {ref: '$user'},
			pipeline: [
				
				{$match: { $expr: {$and: [
								{$ne: ['$$ref.isActive', false]},
								{$eq: ['$$ref.type', 0]},
								{$eq: ['$$ref.code', '$code']}
							]}}},
				
				//Apenas adiciona o periodo
				{$addFields: {period: {$concat: [
								{$cond: [ {$lt: ['$month', 10]}, '0', '' ] }, {$substr: ['$month', 0, -1]},
								'/',
								{$cond: [ {$lt: ['$year', 100]}, '20', '' ] }, {$substr: ['$year', 0, -1]}
							]} }},
				
				//Evita enviar preços zerados
				{$match: { $expr: {$ne: ['$price', 0]}}},
			],
			as: 'milkPrice'
		}});
	
	//------------------------------------------------------------------------------------------------------------------
	//Prepare the milkStatements (Demonstrativo)
	query.push({$lookup: {
			from: 'milkStatements',
			let: {ref: '$user', farm: {$arrayElemAt: ['$properties', 0] }},
			pipeline: [
				{$match: { $expr: {$and: [
								{$ne: ['$$ref.isActive', false]},
								{$eq: ['$$ref.type', 0]},
								{$eq: ['$$ref.code', '$code']}
							]}}},
				{$project: {
						_id: 1,                 //backward compatibility
						updatedAt: 1,           //backward compatibility
						dummyData: 1,           //backward compatibility
						code : 1,               //backward compatibility
						month: '$month',        //backward compatibility:
						year: '$year',          //backward compatibility:
						period: {$concat: [
								{$cond: [ {$lt: ['$month', 10]}, '0', '' ] },
								{$substr: ['$month', 0, -1]},
								'/',
								{$cond: [ {$lt: ['$year', 100]}, '20', '' ] },
								{$substr: ['$year', 0, -1]}
							]},
						loc: '$loc' ,
						address: '$address' ,
						state: '$state' ,
						cnpj: '$cnpj' ,
						subs: '$subs' ,
						ie: '$ie',
						ie_prod: '$$farm.ie',
						cfop: '$cfop' ,
						oper: '$oper' ,
						name: '$name' ,
						cpf_cnpj: '$cpf_cnpj' ,
						farm_name: '$farm_name' ,
						city: '$city' ,
						items: '$Items',  //Esse item inclui os itens itens 31 (DESCONTO SAT), 32 (DESCONTO SENAR), 33 (DESCONTO DE FPAS), 55 (PIS FORNEC PESSOA FISICA) e 56 (COFINS FORNEC PESSOA FISICA)
						nf_valor_nota: '$nf_valor_nota',
						nf_valor_total: '$nf_valor_total',
					}}
			],
			as: 'milkStatements'
		}});
	
	//------------------------------------------------------------------------------------------------------------------
	//Prepare the milkQuality
	query.push({$lookup: {
			from: 'milkQuality',
			let: {ref: '$user'},
			pipeline: [
				{$match: { $expr: {$and: [
								{$ne: ['$$ref.isActive', false]},
								{$eq: ['$$ref.type', 0]},
								{$eq: ['$$ref.code', '$code']}
							]}}},
				{$project: {
						batchId:   '$batchId',
						code:      '$code',
						company:   '$company',
						factory:   '$factory',
						period:    '$period',
						updatedAt: '$updatedAt',
						testedAt:   {$concat: [ {$substr: ['$period', 0, 2]}, '/', {$substr: ['$period', 3, 2]}, '/', '20', {$substr: ['$period', 6, 2]}  ]} ,
						results: {$concatArrays: [
								{$map: {input: '$ccs',  as: 'a', in: {type: 'ccs',  value: '$$a.ccs_value',  protocol: '$$a.ccs_protocolo'  }}} ,
								{$map: {input: '$esd',  as: 'b', in: {type: 'esd',  value: '$$b.esd_value',  protocol: '$$b.esd_protocolo'  }}} ,
								{$map: {input: '$est',  as: 'c', in: {type: 'est',  value: '$$c.est_value',  protocol: '$$c.est_protocolo'  }}} ,
								{$map: {input: '$fat',  as: 'd', in: {type: 'fat',  value: '$$d.fat_value',  protocol: '$$d.fat_protocolo'  }}} ,
								{$map: {input: '$lact', as: 'e', in: {type: 'lact', value: '$$e.lact_value', protocol: '$$e.lact_protocolo' }}} ,
								{$map: {input: '$prot', as: 'f', in: {type: 'prot', value: '$$f.prot_value', protocol: '$$f.prot_protocolo'}}} ,
								{$map: {input: '$ufc',  as: 'g', in: {type: 'cbt',  value: '$$g.ufc_value',  protocol: '$$g.ufc_protocolo'  }}} ,
							]}
					}},
				
				{$unwind: '$results'},
				
				{$group: {
						_id: {
							_id:       '$_id',
							batchId:   '$batchId',
							code:      '$code',
							company:   '$company',
							factory:   '$factory',
							period:    '$period',
							testedAt:  '$testedAt',
							updatedAt: '$updatedAt',
							protocol:  '$results.protocol',
						},
						results: {$addToSet: {
								value:    '$results.value',
								type:     '$results.type',
							}}
					}} ,
				
				{$project: {
						_id:       '$_id._id',
						batchId:   '$_id.batchId',
						code:      '$_id.code',
						company:   '$_id.company',
						factory:   '$_id.factory',
						period:    '$_id.period',
						testedAt:  '$_id.testedAt',
						updatedAt: '$_id.updatedAt',
						protocol:  '$_id.protocol',
						ccs:  {$arrayElemAt: [{$map: {input: {$filter: {input: '$results', as: 'item', cond: {$eq: ['$$item.type', 'ccs' ] }}}, as: 'res', in : '$$res.value'}}, 0]},
						esd:  {$arrayElemAt: [{$map: {input: {$filter: {input: '$results', as: 'item', cond: {$eq: ['$$item.type', 'esd' ] }}}, as: 'res', in : '$$res.value'}}, 0]},
						est:  {$arrayElemAt: [{$map: {input: {$filter: {input: '$results', as: 'item', cond: {$eq: ['$$item.type', 'est' ] }}}, as: 'res', in : '$$res.value'}}, 0]},
						fat:  {$arrayElemAt: [{$map: {input: {$filter: {input: '$results', as: 'item', cond: {$eq: ['$$item.type', 'fat' ] }}}, as: 'res', in : '$$res.value'}}, 0]},
						lact: {$arrayElemAt: [{$map: {input: {$filter: {input: '$results', as: 'item', cond: {$eq: ['$$item.type', 'lact'] }}}, as: 'res', in : '$$res.value'}}, 0]},
						prot: {$arrayElemAt: [{$map: {input: {$filter: {input: '$results', as: 'item', cond: {$eq: ['$$item.type', 'prot'] }}}, as: 'res', in : '$$res.value'}}, 0]},
						cbt:  {$arrayElemAt: [{$map: {input: {$filter: {input: '$results', as: 'item', cond: {$eq: ['$$item.type', 'cbt' ] }}}, as: 'res', in : '$$res.value'}}, 0]},
					}} ,
			],
			as: 'milkQualityNovo'
			
		}});
	
	query.push({$lookup: {
			from: 'milkQuality',
			let: {ref: '$user'},
			pipeline: [
				{$match: { $expr: {$and: [
								{$ne: ['$$ref.isActive', false]},
								{$eq: ['$$ref.type', 0]},
								{$eq: ['$$ref.code', '$code']}
							]}}},
				{$project: {
						batchId:   '$batchId',
						code:      '$code',
						company:   '$company',
						factory:   '$factory',
						period:    '$period',
						updatedAt: '$updatedAt',
						testedAt:   {$concat: [ {$substr: ['$period', 0, 2]}, '/', {$substr: ['$period', 3, 2]}, '/', '20', {$substr: ['$period', 6, 2]}  ]} ,
						results: {$concatArrays: [
								{$map: {input: '$ccs',  as: 'a', in: {type: 'ccs',  value: '$$a.ccs_value',  protocol: '$$a.ccs_protocolo'  }}} ,
								{$map: {input: '$esd',  as: 'b', in: {type: 'esd',  value: '$$b.esd_value',  protocol: '$$b.esd_protocolo'  }}} ,
								{$map: {input: '$est',  as: 'c', in: {type: 'est',  value: '$$c.est_value',  protocol: '$$c.est_protocolo'  }}} ,
								{$map: {input: '$fat',  as: 'd', in: {type: 'fat',  value: '$$d.fat_value',  protocol: '$$d.fat_protocolo'  }}} ,
								{$map: {input: '$lact', as: 'e', in: {type: 'lact', value: '$$e.lact_value', protocol: '$$e.lact_protocolo' }}} ,
								{$map: {input: '$prot', as: 'f', in: {type: 'prot', value: '$$f.prot_value', protocol: '$$f.prot_protocolo'}}} ,
								{$map: {input: '$ufc',  as: 'g', in: {type: 'cbt',  value: '$$g.ufc_value',  protocol: '$$g.ufc_protocolo'  }}} ,
							]}
					}},
				{$unwind: '$results'},
				
				{$group: {
						_id: {
							_id:       '$_id',
							batchId:   '$batchId',
							code:      '$code',
							company:   '$company',
							factory:   '$factory',
							period:    '$period',
							testedAt:  '$testedAt',
							updatedAt: '$updatedAt',
							protocol:  '$results.protocol',
						},
						results: {$addToSet: {
								value:    '$results.value',
								type:     '$results.type',
							}}
					}} ,
				
				{$project: {
						_id:       '$_id._id',
						batchId:   '$_id.batchId',
						code:      '$_id.code',
						company:   '$_id.company',
						factory:   '$_id.factory',
						period:    '$_id.period',
						testedAt:  '$_id.testedAt',
						updatedAt: '$_id.updatedAt',
						protocol:  '$_id.protocol',
						ccs:  {$arrayElemAt: [{$map: {input: {$filter: {input: '$results', as: 'item', cond: {$eq: ['$$item.type', 'ccs' ] }}}, as: 'res', in : '$$res.value'}}, 0]},
						esd:  {$arrayElemAt: [{$map: {input: {$filter: {input: '$results', as: 'item', cond: {$eq: ['$$item.type', 'esd' ] }}}, as: 'res', in : '$$res.value'}}, 0]},
						est:  {$arrayElemAt: [{$map: {input: {$filter: {input: '$results', as: 'item', cond: {$eq: ['$$item.type', 'est' ] }}}, as: 'res', in : '$$res.value'}}, 0]},
						fat:  {$arrayElemAt: [{$map: {input: {$filter: {input: '$results', as: 'item', cond: {$eq: ['$$item.type', 'fat' ] }}}, as: 'res', in : '$$res.value'}}, 0]},
						lact: {$arrayElemAt: [{$map: {input: {$filter: {input: '$results', as: 'item', cond: {$eq: ['$$item.type', 'lact'] }}}, as: 'res', in : '$$res.value'}}, 0]},
						prot: {$arrayElemAt: [{$map: {input: {$filter: {input: '$results', as: 'item', cond: {$eq: ['$$item.type', 'prot'] }}}, as: 'res', in : '$$res.value'}}, 0]},
						cbt:  {$arrayElemAt: [{$map: {input: {$filter: {input: '$results', as: 'item', cond: {$eq: ['$$item.type', 'cbt' ] }}}, as: 'res', in : '$$res.value'}}, 0]},
					}} ,
				
				{$group: {
						_id: {
							_id:       '$_id',
							batchId:   '$batchId',
							code:      '$code',
							company:   '$company',
							factory:   '$factory',
							period:    '$period',
							testedAt:  '$testedAt',
							updatedAt: '$updatedAt',
						},
						fat_sum:  {$sum: '$fat'},
						esd_sum:  {$sum: '$esd'},
						est_sum:  {$sum: '$est'},
						prot_sum: {$sum: '$prot'},
						lact_sum: {$sum: '$lact'},
						cbt_sum:  {$sum: '$cbt'},
						ccs_sum:  {$sum: '$ccs'},
						fat_count:  {$sum: {$cond: [ {$gt: ['$fat',  0]}, 1, 0]}},
						esd_count:  {$sum: {$cond: [ {$gt: ['$esd',  0]}, 1, 0]}},
						est_count:  {$sum: {$cond: [ {$gt: ['$est',  0]}, 1, 0]}},
						prot_count: {$sum: {$cond: [ {$gt: ['$prot', 0]}, 1, 0]}},
						lact_count: {$sum: {$cond: [ {$gt: ['$lact', 0]}, 1, 0]}},
						ccs_count:  {$sum: {$cond: [ {$gt: ['$ccs',  0]}, 1, 0]}},
						cbt_count:  {$sum: {$cond: [ {$gt: ['$cbt',  0]}, 1, 0]}},
					}},
				{$project: {
						_id:       '$_id._id',
						batchId:   '$_id.batchId',
						code:      '$_id.code',
						company:   '$_id.company',
						factory:   '$_id.factory',
						period:    '$_id.period',
						testedAt:  '$_id.testedAt',
						updatedAt: '$_id.updatedAt',
						protocol:  '$_id.protocol',
						fat:  {$divide: [ '$fat_sum',   {$cond: [ {$eq: ['$fat_count',   0]}, {$literal: 1}, '$fat_count' ]} ] },
						esd:  {$divide: [ '$esd_sum',   {$cond: [ {$eq: ['$esd_count',   0]}, {$literal: 1}, '$esd_count' ]} ] },
						est:  {$divide: [ '$est_sum',   {$cond: [ {$eq: ['$est_count',   0]}, {$literal: 1}, '$est_count' ]} ] },
						prot: {$divide: [ '$prot_sum',  {$cond: [ {$eq: ['$prot_count',  0]}, {$literal: 1}, '$prot_count']} ] },
						lact: {$divide: [ '$lact_sum',  {$cond: [ {$eq: ['$lact_count',  0]}, {$literal: 1}, '$lact_count' ]} ] },
						ccs:  {$divide: [ '$ccs_sum',   {$cond: [ {$eq: ['$ccs_count',   0]}, {$literal: 1}, '$ccs_count' ]} ] },
						cbt:  {$divide: [ '$cbt_sum',   {$cond: [ {$eq: ['$cbt_count',   0]}, {$literal: 1}, '$cbt_count' ]} ] },
					}},
			
			],
			as: 'milkQuality'
		}});
	
	//------------------------------------------------------------------------------------------------------------------
	//Prepare the MilkVolume (informação diária de volume de leite)
	query.push({$lookup: {
			from: 'milkVolume',
			let: {ref: '$user'},
			pipeline: [
				{$match: { $expr: {$and: [
								{$ne: ['$$ref.isActive', false]},
								{$eq: ['$$ref.type', 0]},
								{$eq: ['$$ref.code', '$code']}
							]}}},
				{$project: {
						_id: 			1,   //O _id é utilizado na exibição de valores do app. NÃO REMOVER
						updatedAt: 1,                                           //backward compatibility
						dummyData: 1,                                           //backward compatibility
						code : 1,                                               //backward compatibility
						start_date: {$substr: ['$start_date', 0, 10]},          //backward compatibility
						start_time: 1,                                          //backward compatibility
						arrival_date: {$substr: ['$arrival_date', 0, 10]}, 	//backward compatibility
						arrival_time: 1,                                        //backward compatibility
						collectedAt: {$concat: [ {$substr: ['$start_date', 0, 10]}, ' ', {$substr: ['$start_time', 0, -1]}]},
						arrivedAt: {$concat: [ {$substr: ['$arrival_date', 0, 10]}, ' ', {$substr: ['$arrival_time', 0, -1]}]},
						volume: '$volume',
						temperature: '$temperature',
						device: '$device',
						driver: '$driver',
						ra: '$ra',
						route: '$route',
						tp: '$tp',
						trans: '$trans',
						pk_resfriador: '$pk_resfriador',
					}},
				
				//Evita enviar volumes zerados
				{$match: { $expr: {$ne: ['$volume', 0]}}},
			
			],
			as: 'milkVolume'
		}});
	
	/*
	  **********************************************************************
	  * Comentado porque HOME do produtor não exibe mais esses dados...
	  **********************************************************************
		//Get the temporary volume for the current month
		query.push({$lookup: {
			from: 'milkVolume',
			let: {ref: '$user', curDate: '$currentDate'},
			pipeline: [
				{$match: { $expr: {$and: [
					{$ne: ['$$ref.isActive', false]},
					{$eq: ['$$ref.type', 0]},
					{$eq: ['$$ref.code', '$code']},
					{$eq: [ {$substr: ['$start_date',0, 7]}, {$dateToString: {format: '%Y-%m', date: '$$curDate'}} ]}
				]}}},
				{$group: {
					_id: {$dateToString: {format: '%m/%Y', date: '$$curDate'}},
					volume: {$sum: '$volume'}
				}},
				{$project: {
					_id: 0,
					period: '$_id',
					month: {$dateToString: {format: '%m', date: '$$curDate'}} ,    //backward compatibility
					year:{$dateToString: {format: '%Y', date: '$$curDate'}} ,      //backward compatibility
					volume: '$volume',
				}},
				],
				as: 'currentMonthVolume'
		}});
		query.push({$unwind: {path: '$currentMonthVolume', preserveNullAndEmptyArrays: true}});
	**********************************************************************
	*/
	
	//------------------------------------------------------------------------------------------------------------------
	//Prepare the milkQualityReport (IN62)
	query.push({$lookup: {
			from: 'milkQualityReport',
			let: {ref: '$user'},
			pipeline: [
				{$match: { $expr: {$and: [
								{$ne: ['$$ref.isActive', false]},
								{$eq: ['$$ref.type', 0]},
								{$eq: ['$$ref.code', '$code']}
							]}}},
				{$project: {
						_id: 1,
						period: {$concat: [
								{$cond: [ {$lt: ['$month', 10]}, '0', '' ] },
								{$substr: ['$month', 0, -1]},
								'/',
								{$cond: [ {$lt: ['$year', 100]}, '20', '' ] },
								{$substr: ['$year', 0, -1]}
							]},
						month: '$month',
						year: '$year',
						fat: '$fat',
						esd: '$esd',
						est: '$est',
						prot: '$prot',
						lact: '$lact',
						ccs: '$ccs',
						cbt: '$cbt',
						fatstatus: '$fatstatus',
						esdstatus: '$esdstatus',
						eststatus: '$eststatus',
						protstatus: '$protstatus',
						lactstatus: '$lactstatus',
						ccsstatus: '$ccsstatus',
						cbtstatus: '$cbtstatus',
					}}
			],
			as: 'milkQualityReport'
		}});
	
	//------------------------------------------------------------------------------------------------------------------
	//Prepare the milkQualityStandands (current IN62 parameters)
	query.push({$lookup: {
			from: 'milkQualityStandards',
			let: {},
			pipeline: [
				{$project: {
						_id: 0,
						cbt:  {$concat: ['Máx ', {$substr: ['$cbt', 0, -1]} ]},
						ccs:  {$concat: ['Máx ', {$substr: ['$ccs', 0, -1]} ]},
						esd:  {$concat: ['Mín ', {$substr: ['$esd', 0, -1]} ]},
						est:  {$concat: ['Mín ', {$substr: ['$est', 0, -1]} ]},
						fat:  {$concat: ['Mín ', {$substr: [{$subtract: [ '$gordura', {$mod: [ '$gordura', 1 ] }]}, 0, -1]}, '.', {$substr: [{$mod: [ '$gordura', 1 ] }, 0, -1]}   ]},
						prot: {$concat: ['Mín ', {$substr: ['$proteina', 0, -1]} ]},
						desc: '$desc'
					}}
			],
			as: 'milkQualityStandards'
		}});
	query.push({$unwind: '$milkQualityStandards'});
	
	//------------------------------------------------------------------------------------------------------------------
	//Prepare the Notifications info
	query.push({$lookup: {from: 'notifications', localField : 'user.code', foreignField: 'code', as: 'notifications' }});
	
	//------------------------------------------------------------------------------------------------------------------
	//Prepare the CheckLists
	query.push({$lookup: {
			from: 'checklists',
			let: {ref: '$user'},
			pipeline: [
				{$addFields: {
						allowAnswer: {$cond: [ {$in: ['$$ref.type', '$target']} , true, false] },
					}},
				{$lookup: {
						from: 'checklistResults',
						let: {code: '$$ref.code', checklistId: '$_id'},
						pipeline: [
							{$match: { $expr: {$eq: ['$$checklistId', '$checklistId']}}},
							{$match: {$expr: {$or: [
											{$eq: ['$code', '$$code']},
											{$eq: ['$propertyCode', '$$code']},
										]}}},
						],
						as: 'results'
					}},
				{$match: {$expr: {$and: [
								{$ne: ['$$ref.isActive', false]},
								{$or: [
										{$in: ['$$ref.type', '$target']},
										{$gt: [{$size: '$results'}, 0]},
									]}
							]}}},
			],
			as: 'checklists'
		}});
	
	//------------------------------------------------------------------------------------------------------------------
	//Prepare the milkPriceMinimum (Tendência de Preço Mínimo para cada produtor)
	query.push({$lookup: {
			from: 'milkPriceMinimum',
			let: {ref: '$user'},
			pipeline: [
				{$match: { $expr: {$and: [
								{$ne: ['$$ref.isActive', false]},
								{$eq: ['$$ref.type', 0]},
								{$eq: ['$$ref.code', '$code']}
							]}}},
				{$project: {
						_id: 0,
						value: {
							price: '$price',
							extra: '$extra',
							tendency: '$tendency',
							tendency_month: {$ifNull: ['$tendency_month', {$cond: [ {$eq: ['$month', 12]} , 1, {$add: ['$month',1]} ]}]},
							tendency_year: {$add: ['$year', {$cond: [ {$and: [ {$eq: ['$month', 12]}, {$eq: ['$tendency_month', 1]} ]}, 1, 0]} ]},
							period: {$concat: [
									{$cond: [ {$lt: ['$year', 100]}, '20', '' ] },
									{$substr: ['$year', 0, -1]},
									{$cond: [ {$lt: ['$month', 10]}, '0', '' ] },
									{$substr: ['$month', 0, -1]},
								]},
							month: '$month',
							year: '$year',
						}
					}},
				{$group: {
						_id: null,
						values: {$addToSet: '$value'}
					}},
				{$project: {
						value: {$filter: {input: '$values', as: 'item', cond: {$eq: ['$$item.period', {$max: '$values.period'}] } }},
					}},
				{$unwind: '$value'},
				{$project: {
						_id: '$value._id',
						price: '$value.price',
						extra: '$value.extra',
						tendency: '$value.tendency',
						tendency_period: {$concat: [
								{$cond: [ {$lt: ['$value.tendency_month', 10]}, '0', '' ] },
								{$substr: ['$value.tendency_month', 0, -1]},
								'/',
								{$cond: [ {$lt: ['$value.tendency_year', 100]}, '20', '' ] },
								{$substr: ['$value.tendency_year', 0, -1]},
							]},
						period: {$concat: [
								{$cond: [ {$lt: ['$value.month', 10]}, '0', '' ] },
								{$substr: ['$value.month', 0, -1]},
								'/',
								{$cond: [ {$lt: ['$value.year', 100]}, '20', '' ] },
								{$substr: ['$value.year', 0, -1]},
							]},
						month: '$value.month',
						year: '$value.year',
					}},
			],
			as: 'milkPriceMinimum'
		}});
	query.push({$unwind: {path: '$milkPriceMinimum', preserveNullAndEmptyArrays: true}});
	
	//------------------------------------------------------------------------------------------------------------------
	//Prepare the milkPriceSimulator (Parâmetros de Simulador de Preço)
	query.push({$lookup: {
			from: 'milkPriceSimulator',
			let: {ref: '$user', farm: {$arrayElemAt: ['$properties', 0]}},
			pipeline: [
				{$match: { $expr: {$and: [
								{$ne: ['$$ref.isActive', false]},
								{$eq: ['$$ref.type', 0]},
								{$or: [
										{$and: [ {$eq: ['$$farm.company', '$company']}, {$eq: ['$$farm.factory', '$factory']} ]},
										{$and: [ {$eq: [''              , '$company']}, {$eq: [''              , '$factory']} ]}
									]}
							]}}},
				{$group: {
						_id: {$toLower: '$description'},
						values: {$first: '$values'}
					}},
				{$project: {
						_id: 0,
						type: '$_id',
						values:  '$values',
					}}
			],
			as: 'milkPriceSimulator'
		}});
	
	//------------------------------------------------------------------------------------------------------------------
	//prepare milkPriceFactors (o que de fato será enviado para o app)
	query.push({$addFields: {
			milkPriceFactors:{
				period:          {$ifNull: ['$milkPriceMinimum.period', {$dateToString: {format: '%m/%Y', date: '$currentDate'}} ]},
				basePrice:       {$ifNull: ['$milkPriceMinimum.price', 0 ]},
				marketBonus:     {$ifNull: ['$milkPriceMinimum.extra', 0 ]},
				tendency:        {$ifNull: ['$milkPriceMinimum.tendency', 'não informado' ]},
				tendency_period: {$ifNull: ['$milkPriceMinimum.tendency_period', 'não informado' ]},
				cbt:             {$ifNull: [{$arrayElemAt: [{$filter: {input: '$milkPriceSimulator', as: 'items', cond: {$eq: [ '$$items.type', 'cbt'       ] } }}, 0]}, {type: 'não informado', values:[]} ]},
				ccs:             {$ifNull: [{$arrayElemAt: [{$filter: {input: '$milkPriceSimulator', as: 'items', cond: {$eq: [ '$$items.type', 'ccs'       ] } }}, 0]}, {type: 'não informado', values:[]} ]},
				bpf:             {$ifNull: [{$arrayElemAt: [{$filter: {input: '$milkPriceSimulator', as: 'items', cond: {$eq: [ '$$items.type', 'bpf'       ] } }}, 0]}, {type: 'não informado', values:[]} ]},
				pncebt:          {$ifNull: [{$arrayElemAt: [{$filter: {input: '$milkPriceSimulator', as: 'items', cond: {$eq: [ '$$items.type', 'pncebt'    ] } }}, 0]}, {type: 'não informado', values:[]} ]},
				fat:             {$ifNull: [{$arrayElemAt: [{$filter: {input: '$milkPriceSimulator', as: 'items', cond: {$eq: [ '$$items.type', 'gordura'   ] } }}, 0]}, {type: 'não informado', values:[]} ]},
				prot:            {$ifNull: [{$arrayElemAt: [{$filter: {input: '$milkPriceSimulator', as: 'items', cond: {$eq: [ '$$items.type', 'proteína'  ] } }}, 0]}, {type: 'não informado', values:[]} ]},
				volume:          {$ifNull: [{$arrayElemAt: [{$filter: {input: '$milkPriceSimulator', as: 'items', cond: {$eq: [ '$$items.type', 'volume'    ] } }}, 0]}, {type: 'não informado', values:[]} ]},
				km:              {$ifNull: [{$arrayElemAt: [{$filter: {input: '$milkPriceSimulator', as: 'items', cond: {$eq: [ '$$items.type', 'distância' ] } }}, 0]}, {type: 'não informado', values:[]} ]},
			}
		}});
	
	//------------------------------------------------------------------------------------------------------------------
	//Prepare the milkIncomeReport (Informe de Rendimentos)
	query.push({$lookup: {
			from: 'milkIncomeReport',
			let: {ref: '$user'},
			pipeline: [
				{$match: { $expr: {$and: [
								{$eq: ['$$ref.type', 0]},
								{$eq: ['$$ref.code', '$code']}
							]}}}
			],
			as: 'milkIncomeReport'
		}});
	
	//------------------------------------------------------------------------------------------------------------------
	//Prepare the milkInvoices (Notas Fiscais mensais)
	query.push({$lookup: {
			from: 'milkStatements',
			let: {code: '$user.code'},
			pipeline: [
				{$match: { $expr: {$eq: ['$$code', '$code']}}},
				{$project: {
						_id: '$_id',
						dummyData: {$literal: 1},
						statementId: '$_id',
						code : '$code',
						month: '$month',
						year: '$year',
						period: {$concat: [
								{$cond: [ {$lt: ['$month', 10]}, '0', '' ] },
								{$substr: ['$month', 0, -1]},
								'/',
								{$cond: [ {$lt: ['$year', 100]}, '20', '' ] },
								{$substr: ['$year', 0, -1]}
							]},
						xml_file: {$literal: '/preview?type=invoice_xml&id='}, //TODO: Concatenar o ID
						img_file: {$literal: '/preview?type=invoice_img&id='}, //TODO: Concatenar o ID
						pdf_file: {$literal: '/preview?type=invoice_pdf&id='}, //TODO: Concatenar o ID
						uri: {$literal: 'https://milk-api.bovcontrol.com:3009'}
					}}
			],
			as: 'milkInvoices'
		}});
	
	//------------------------------------------------------------------------------------------------------------------
	//Prepare the recents (Dados mais recentes que são exibidos na tela principal)
	query.push({$addFields: {
			recent: {
				lastPickups:          {$filter: {input: '$milkVolume',      as: 'a', cond: {$eq: ['$$a.start_date', {$max: '$milkVolume.start_date'} ]} }},
				lastMonthQualityNovo: {$filter: {input: '$milkQualityNovo', as: 'b', cond: {$eq: [{$substr: ['$$b.testedAt',   3, 7]}, {$dateToString: {format: '%m/%Y', date: '$lastMonthDate' }}] }}},
				lastMonthVolume:      {$filter: {input: '$milkVolume',      as: 'c', cond: {$eq: [{$substr: ['$$c.start_date', 0, 7]}, {$dateToString: {format: '%Y-%m', date: '$lastMonthDate' }}] }}},
				lastMonthPrice:       {$filter: {input: '$milkPrice',       as: 'd', cond: {$eq: [{$substr: ['$$d.period',     0, 7]}, {$dateToString: {format: '%m/%Y', date: '$lastMonthDate' }}] }}},
				currentMonthVolume:   {$filter: {input: '$milkVolume',      as: 'e', cond: {$eq: [{$substr: ['$$e.start_date', 0, 7]}, {$dateToString: {format: '%Y-%m', date: '$currentDate'   }}] }}},
				lastMonthQuality:     {$filter: {input: '$milkQuality', as: 'item', cond: {$eq: [{$substr: ['$$item.testedAt', 3, 7]}, {$dateToString: {format: '%m/%Y', date: '$lastMonthDate' }}] }}},
			}
		}});
	
	//------------------------------------------------------------------------------------------------------------------
	//Project the results
	query.push({$project: {
			user:                   '$user.code',
			mail:                   '$user.mail',
			name:                   '$user.name',
			type:                   '$user.type',
			isDeleted:              '$user.isDeleted',
			isActive:               '$user.isActive',
			properties:             {$cond: [ {$eq: [ '$user.type', 0 ]},
					{$arrayElemAt: ['$properties', 0]},
					'$properties',
				]},
			recent:                 {$cond: [ {$eq: [ '$user.type', 0 ]},
					{   //PRODUCERS
						lastPickup:     {
							count:  {$size: '$recent.lastPickups.volume'},
							volume: {$sum: '$recent.lastPickups.volume'},
							pickups: '$recent.lastPickups'
						},
						lastMonthQualityNovo: '$recent.lastMonthQualityNovo',
						lastMonthQuality: '$recent.lastMonthQuality',
						currentMonth: {
							period: {$dateToString: {format: '%m/%Y', date: '$currentDate'}},
							volume: {$ifNull: [{$sum: '$recent.currentMonthVolume.volume'}, 0]}
						},
						cbt:            {$ifNull: [ {$divide: [ {$sum: '$recent.lastMonthQuality.cbt'},   {$cond: [ {$eq: [ {$size: '$recent.lastMonthQuality.cbt'   }, 0]}, 1, {$size: '$recent.lastMonthQuality.cbt'   }] } ]}, 0]},
						ccs:            {$ifNull: [ {$divide: [ {$sum: '$recent.lastMonthQuality.ccs'},   {$cond: [ {$eq: [ {$size: '$recent.lastMonthQuality.ccs'   }, 0]}, 1, {$size: '$recent.lastMonthQuality.ccs'   }] } ]}, 0]},
						//volume:         {$ifNull: [ {$divide: [ , {$cond: [ {$eq: [ {$size: '$recent.lastMonthVolume.volume' }, 0]}, 1, {$size: '$recent.lastMonthVolume.volume' }] } ]}, 0]},
						//price:          {$ifNull: [ {$divide: [ {$sum: '$recent.lastMonthPrice.price'},   {$cond: [ {$eq: [ {$size: '$recent.lastMonthPrice.price'   }, 0]}, 1, {$size: '$recent.lastMonthPrice.price'   }] } ]}, 0]},
					},
					{   //SDLs
						cbt:            {$literal: 0}, //{$ifNull: [ {$divide: [ {$sum: '$recent.cbt'},    {$cond: [ {$eq: [ {$size: '$recent.cbt'}, 0]}, 1, {$size: '$recent.cbt'}]} ]}, 0]},
						ccs:            {$literal: 0}, //{$ifNull: [ {$divide: [ {$sum: '$recent.ccs'},    {$cond: [ {$eq: [ {$size: '$recent.ccs'}, 0]}, 1, {$size: '$recent.ccs'}]} ]}, 0]},
						volume:         {$literal: 0}, //{$ifNull: [ {$divide: [ {$sum: '$recent.volume'}, {$cond: [ {$eq: [ {$size: '$recent.volume'}, 0]}, 1, {$size: '$recent.volume'}]} ]}, 0]},
						price:          {$literal: 0}, //{$ifNull: [ {$divide: [ {$sum: '$recent.price'},  {$cond: [ {$eq: [ {$size: '$recent.price'}, 0]}, 1, {$size: '$recent.price'}]} ]}, 0]},
					}
				]},
			milkPrice:              {$cond: [ {$and: [ {$eq: ['$user.type', 0]}, {$ne: ['$user.isActive', false]} ]},
					'$milkPrice',
					'$$REMOVE'
				]},
			milkVolume:             {$cond: [ {$and: [ {$eq: ['$user.type', 0]}, {$ne: ['$user.isActive', false]} ]},
					'$milkVolume',
					'$$REMOVE'
				]},
			milkQuality:            {$cond: [ {$and: [ {$eq: ['$user.type', 0]}, {$ne: ['$user.isActive', false]} ]},
					'$milkQuality',
					'$$REMOVE'
				]},
			milkQualityReport :     {$cond: [ {$and: [ {$eq: ['$user.type', 0]}, {$ne: ['$user.isActive', false]} ]},
					'$milkQualityReport',
					'$$REMOVE'
				]},
			milkQualityStandards:   {$cond: [ {$and: [ {$eq: ['$user.type', 0]}, {$ne: ['$user.isActive', false]} ]},
					'$milkQualityStandards',
					'$$REMOVE'
				]},
			milkQualityNovo:    '$milkQualityNovo',   //AÇÃO DE CONTORNO PARA FACILITAR O DESENVOLVIMENTO PELA TBF
			milkPriceFactors:       {$cond: [ {$and: [ {$eq: ['$user.type', 0]}, {$ne: ['$user.isActive', false]} ]},
					'$milkPriceFactors',
					'$$REMOVE'
				]},
			milkStatements:         {$cond: [ {$and: [ {$eq: ['$user.type', 0]}, {$ne: ['$user.isActive', false]} ]},
					'$milkStatements',
					'$$REMOVE'
				]},
			milkInvoices  :         {$cond: [ {$and: [ {$eq: ['$user.type', 0]} ]},
					'$milkInvoices',
					'$$REMOVE'
				]},
			milkIncomeReport:       {$cond: [ {$eq: ['$user.type', 0]},
					'$milkIncomeReport',
					'$$REMOVE'
				]},
			notifications:          '$notifications',
			checklists:             {$cond: [ {$ne: ['$user.isActive', false]},
					'$checklists',
					'$$REMOVE'
				]},
		}});
	
	/**/
	
	//------------------------------------------------------------------------------------------------------------------
	return query;
	
}

module.exports.getUserDataQuery_v1		= _getUserDataQuery_v1;



