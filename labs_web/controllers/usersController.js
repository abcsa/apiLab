/* eslint-disable no-irregular-whitespace */
'use strict';

let helper = require('../common/helper.js');
let config = require('../common/config.js');
let queries = require('../common/queries.js');
let db = require('../common/db.js');
let _ = require('lodash');

let currentModule = 'usersController.js';
let collectionName = 'users';
let paramId = 'userId';

exports.getUserById = function (req, res, next){
	
	let id = req.params[paramId];
	
	let findQuery;
	
	if (helper.isV4UUID(id)){
		if (_.get(req, 'resources.user._id') === id) {
			return next();
		}
		findQuery = {_id: id};
	}else{
		if (_.get(req, 'resources.user.user') === id) {
			helper.Log(req, currentModule, 'getUserById', 'User "' + id + '" is already known.');
			return next();
		}
		findQuery =  {user: id};
	}

	return db.collection(collectionName).find(findQuery)
		.then(function (result){
			
			if (!result || !result[0]) {
				return next(helper.REST.notFound(currentModule, 'getUserById', 'User "' + id + '"'));
			}
			
			let collection = helper.reduce(result, ['_id', 'user', 'mail', 'name',  'updatedAt', 'isActive']);
			let user = collection[0];
 
			helper.Log(req, currentModule, 'getUserById', 'User "' + id + '" was found. Adding it to req.resources...');
			_.set(req, 'resources.user', user);
			return next();
			
		})
		.catch(function (err){
			return next(err);
		});

};

exports.getUser = function (req, res, next){

	let id = req.params[paramId];
	let authUser = _.get(req.resources, 'authUser');
	let user = _.get(req.resources, 'user');
	let payload = _.get(req.resources, 'payload');
	
	if (authUser.user !== user.user && !helper.hasPermission(payload, 'getUser')) {
		return next(helper.REST.forbidden(currentModule, 'getUser', 'You do not have permissions to read this resource'));
	}

	if (!user) {
		return next(helper.REST.notFound(currentModule, 'getUser', 'User "' + id + '"'));
	}
	
	return helper.audit(req, helper.EVENTS.users.read, user)
		.then(function (){
			return res.send(helper.REST.ok(user));
		})
		.catch(function (err){
			return next(helper.REST.internalServerError(currentModule, 'getUser', err));
		});
	
	
};

exports.listUsers = function (req, res, next){
	
	let searchQuery;
	let payload = _.get(req.resources, 'payload');
	
	if (!helper.hasPermission(payload, 'listUsers')) {
		return next(helper.REST.forbidden(currentModule, 'listUsers', 'You do not have permissions to list this resource'));
	}
	
	if (helper.hasPermission(payload, 'listAll')) {
		searchQuery = {};
	}else{
		searchQuery	= {isDeleted: {$ne: true}, isActive: {$ne: false}};
	}
	
	let filterQuery = {_id: 1, user: 1, mail: 1, name: 1};
	
	db.collection('users').find(searchQuery, filterQuery)
		.then(function (result){
			let collection = result;
			
			helper.audit(req, helper.EVENTS.users.list, 'Listed ' + collection.length + ' items.')
				.then(function () {
					return res.send(helper.REST.ok(collection));
				})
				.catch(function (err){
					return next(helper.REST.internalServerError(currentModule, 'listUsers', err));
				});
			
		})
		.catch(function (err){
			return next(err);
		});

};

exports.updateUser = function (req, res, next){

	let id = req.params[paramId];
	let authUser = _.get(req.resources, 'authUser');
	let user = _.get(req.resources, 'user');
	let payload = _.get(req.resources, 'payload');
	
	if (authUser.user !== user.user && !helper.hasPermission(payload, 'updateUser')) {
		return next(helper.REST.forbidden(currentModule, 'getUser', 'You do not have permissions to update this resource'));
	}
	
	if (!helper.isV4UUID(id)){
		if (authUser && user){
			id = user._id;
		}
	}
 
	if(req.body.id || req.body._id){
		return next(helper.REST.badRequest(currentModule, 'updateUser', 'User id cannot be updated!'));
	}
	if(req.body.user || req.body.code || req.body.userCode || req.body.userName){
		return next(helper.REST.badRequest(currentModule, 'updateUser', 'UserName or userCode cannot be updated!'));
	}
 
	helper.Log(req, currentModule, 'updateUser', 'Updating user "' + id + '"...');
 
	let updateQuery = {$set: {
		updateAt: helper.getCurrentDateString(),
	}};
	
	if(req.body.mail){
		updateQuery.$set.mail = req.body.mail;
	}
	if(req.body.name){
		updateQuery.$set.name = req.body.name;
	}

	
	return _updateUser(id, updateQuery)
		.then(function () {
			return res.send(helper.REST.ok({userId: id}));
		})
		.catch(function (err){
			return next(err);
		});
	
};

exports.createUser = function (req, res, next){
	
	//TODO: Implement this function
	return next(helper.REST.notImplemented(currentModule));
	
};

exports.deleteUser = function (req, res, next){

	let id = req.params[paramId];
	
	helper.Log(req, currentModule, 'deleteUser', 'Deleting user "' + id + '"...');
	
	let updateQuery = {$set: {
		deletedAt: helper.getCurrentDateString(),
		isDeleted: true
	}};
	
	return _updateUser(id, updateQuery)
		.then(function () {
			helper.Log(req, currentModule, 'deleteUser', 'User "' + id + '" was deleted.');
			return next(helper.REST.noContent('deleteUser', 'User "' + id + '" was deleted.'));
		})
		.catch(function (err){
			return next(err);
		});
	
};

exports.getUserData = function (req, res, next) {

	let startTime = new Date();
	let returnData;
	
	let user = _.get(req.resources, 'authUser');
	if (!user) {
		return next(helper.REST.badRequest(currentModule, 'getUserData', 'Unable to locate current user data'));
	}
	
	let token = _.get(req.resources, 'token');
	if (!token) {
		return next(helper.REST.badRequest(currentModule, 'getUserData', 'Unable to locate current user token'));
	}
	
	let code = user.user;
	let query;
	
	let apiVersion = parseFloat(req.headers['accept-version'] || 2);

	switch (apiVersion){
		case 1:
			query = queries.getUserDataQuery_v1(code);
			break;
			
		case 2:
			query = queries.getUserDataQuery_v2(code, user.impersonatedFrom);
			break;
			
		case 2.1:
			query = queries.getUserDataQuery_v2_1(code, user.impersonatedFrom);
			break;
			
		case 2.2:
            query = queries.getUserDataQuery_v2_2(code, user.impersonatedFrom, DEFAULT_FROM_LAST_DAYS);
            break;

        case 2.3:
            query = queries.getUserDataQuery_v2_3(code, user.impersonatedFrom, DEFAULT_FROM_LAST_DAYS);
            break;

		case 3:
			query = queries.getUserDataQuery_v3(code, user.impersonatedFrom, DEFAULT_FROM_LAST_DAYS);
			break;

		default:
			query = queries.getUserDataQuery_v2(code, user.impersonatedFrom);
			break;
	}
	
	helper.Log(req, currentModule, 'getUserData', 'Reading data for user "' + code + '"' +  (user.impersonatedFrom ? ' (user "' + user.impersonatedFrom + '" impersonating user "' +  code + '")' : '') + ', using query version "' + apiVersion + '"...');
	db.collection(collectionName).aggregate(query, {'allowDiskUse': true})
	
		//--------------------------------------------------------------------------------------------------------------
		.then(function (data) {
			
			if (!data || !data[0]) {
				helper.Log(req, currentModule, 'getUserData', '   User "' + user.user + '"' + (user.impersonatedFrom ? ' (user "' + user.impersonatedFrom + '" impersonating user "' + code + '")' : '') + ' was not found!');
				return next(helper.REST.notFound(currentModule, 'getUserData', 'User "' + code + '"'));
			}
			
			returnData = data[0];
			
			if (user.impersonatedFrom) {
				returnData.impersonatedFrom = user.impersonatedFrom;
			}
			
			return Promise.resolve();

		})
		/*
		//--------------------------------------------------------------------------------------------------------------
		.then(function () {

			if(returnData){
				helper.Log(req, currentModule, 'getUserData', '      Adding XXXXX results...');
			}
			
			return Promise.resolve();
		})
		.then(function () {
			

			
			if(returnData){
				helper.Log(req, currentModule, 'getUserData', '      Adding aditional results...');
				
				switch (returnData.type){
					case 0:
						//01) milkPrice:                                    FARM -----------------------------------------------------------------------------------------------
						//02) milkVolume:                                   FARM -----------------------------------------------------------------------------------------------
						//03) milkQuality :                                 FARM -----------------------------------------------------------------------------------------------
						
						query = queries.getUserDataQuery_v2(code, user.impersonatedFrom);
						
						query = queries.getUserDataQuery_v2(code, user.impersonatedFrom);
						
						query = queries.getUserDataQuery_v2(code, user.impersonatedFrom);
						
						break;
						
					case 1:
						//01) milkPrice:                                    FARM -----------------------------------------------------------------------------------------------
						//02) milkVolume:                                   FARM -----------------------------------------------------------------------------------------------
						//03) milkQuality :                                 FARM -----------------------------------------------------------------------------------------------
						
						break;
					
					case 2:
						//01) milkPrice:                                    FARM -----------------------------------------------------------------------------------------------
						//02) milkVolume:                                   FARM -----------------------------------------------------------------------------------------------
						//03) milkQuality :                                 FARM -----------------------------------------------------------------------------------------------
						
						break;
						
				}
				
			}else{
				helper.Log(req, currentModule, 'getUserData', '      No user data was found.');
			}
			
			//04) milkIncomeReport (Informe de Rendimentos):    PRODUCERS ------------------------------------------------------------------------------------------
			//05) milkStatements (Demontrativo de Pagamento):   PRODUCERS ------------------------------------------------------------------------------------------
			//06) milkInvoices (Notas Fiscais):                 PRODUCERS ------------------------------------------------------------------------------------------
			//07) milkQualityReport (Notificações de IN62):     PRODUCERS ------------------------------------------------------------------------------------------
			//08) Recents:                                      ALL ------------------------------------------------------------------------------------------------
			//09) milkPriceFactors:                             PRODUCERS ------------------------------------------------------------------------------------------
			//10) milkQualityStandards (Padrões da IN62 atual): ALL ------------------------------------------------------------------------------------------------
			//11) Notification:                                 ALL ------------------------------------------------------------------------------------------------
			//12) Checklists:                                   ALL ------------------------------------------------------------------------------------------------
			//13) Recents:										ALL ------------------------------------------------------------------------------------------------
			
			return Promise.resolve();
		})
		*/
		//--------------------------------------------------------------------------------------------------------------
		.then(function () {
			
			if (returnData) {
				helper.Log(req, currentModule, 'getUserData', '      Checking resources to add URLs (could be removed once the query return them)...');
				
				//   1) Avatar
				//helper.Log(req, currentModule, 'getUserData', '         Adding avatar url...');
				returnData.avatarUrl = config.url.base + '/preview?' + 'type=avatar&scale=1&id=' + (returnData._id || DEFAULT_AVATAR_ID);
				
				//	 2) Checklists
				//helper.Log(req, currentModule, 'getUserData', '         Checking checklists...');
				if (returnData.checklists) {
					let checklistCount = 0;
					returnData.checklists.forEach(function (checklist, checklistIndex, checklists) {
						checklist.results.forEach(function (result, resultIndex) {
							checklistCount++;
							//helper.Log(req, currentModule, 'getUserData', '            Adding checklist URL (item ' + checklistCount + ')...');
							checklists[checklistIndex].results[resultIndex].url = config.url.base + '/preview?type=checklist_pdf&scale=1&id=' + result._id;

							if (apiVersion >= 2.2) {

								//workaround TBF
								checklists[checklistIndex].results[resultIndex].items = [];   		// Retirar nos proximos releases (manter apenas o delete);
								//delete checklists[checklistIndex].results[resultIndex].items;
								
								delete checklists[checklistIndex].results[resultIndex].exportedAt;
								delete checklists[checklistIndex].results[resultIndex].isExported;
							}

						});
					});
				}

				//	 3) Statements
				//helper.Log(req, currentModule, 'getUserData', '         Checking statements (demonstrativo de pagamento)...');
				let statementsArray = [];
				if (returnData && returnData.property && returnData.property.milkStatements){
					statementsArray = returnData.property.milkStatements;
				}else if(returnData && returnData.milkStatements){
					statementsArray = returnData.milkStatements;
				}
				let statementCount = 0;
				statementsArray.forEach(function (statement, statementIndex, statements) {
					statementCount++;
					//helper.Log(req, currentModule, 'getUserData', '            Adding statement URL (item ' + statementCount + ')...');
					statements[statementIndex].url = config.url.base + '/preview?type=incomereport_pdf&id=' + statements[statementIndex]._id;
 
					if (apiVersion >= 2.2) {
						//delete statements[statementIndex]._id;
						delete statements[statementIndex].code;
						delete statements[statementIndex].loc;
						delete statements[statementIndex].address;
						delete statements[statementIndex].state;
						delete statements[statementIndex].cnpj;
						delete statements[statementIndex].subs;
						delete statements[statementIndex].ie;
						delete statements[statementIndex].ie_prod;
						delete statements[statementIndex].cfop;
						delete statements[statementIndex].oper;
						delete statements[statementIndex].name;
						delete statements[statementIndex].cpf_cnpj;
						delete statements[statementIndex].farm_name;
						delete statements[statementIndex].city;
						delete statements[statementIndex].items;
						delete statements[statementIndex].nf_valor_nota;
						delete statements[statementIndex].nf_valor_total;
					}
					
				});

				//	 4) Invoices
				//helper.Log(req, currentModule, 'getUserData', '         Checking invoices (notas fiscais)...');
				let invoiceArray = [];
				if (returnData && returnData.property && returnData.property.milkInvoices){
					invoiceArray = returnData.property.milkInvoices;
				}else if(returnData && returnData.milkInvoices){
					invoiceArray = returnData.milkInvoices;
				}
				let invoiceCount = 0;
				invoiceArray.forEach(function (invoice, invoiceIndex, invoices) {
					invoiceCount++;
					//helper.Log(req, currentModule, 'getUserData', '            Adding invoice URL (item ' + invoiceCount + ')...');
					invoices[invoiceIndex].url = config.url.base + '/preview?type=invoice_pdf&id=' + invoices[invoiceIndex]._id;

					if (apiVersion >= 2.2) {
						//delete invoices[invoiceIndex]._id;
						delete invoices[invoiceIndex].statementId;
						//delete invoices[invoiceIndex].period;
						delete invoices[invoiceIndex].code;
					}
				});
				
				//	 5) Notifications:  Gambiarra para retornar o deep link correto dos checklists
				//helper.Log(req, currentModule, 'getUserData', '      Checking checklist notification links...');
				returnData.notifications.forEach(function (notification, notificationIndex, notifications) {
					
					if (notifications[notificationIndex].type === 'checklist' && apiVersion >= 2.2) {
						let notificationCount = 0;
						
						notification.actions.forEach(function (action, actionIndex, actions) {
							if (action.text === 'Visualizar') {
								
								let fromURL = action.action;
								let toURL = helper.convertChecklistLinkToDeepLink(fromURL);
								
								if (fromURL !== toURL) {
									notificationCount++;
									notifications[notificationIndex].actions[actionIndex].action = toURL;
									//helper.Log(req, currentModule, 'getUserData', '            Replacing checklist notification links (item ' + notificationCount + ', from "' + fromURL + '" to "' + toURL + '")...');
								}
							}
						});
					}
				});
				
				if (apiVersion >= 3) {
					
					let fromDate = null;
					let toDate = null;

					//helper.Log(req, currentModule, 'getUserData', '  User "' + returnData.user + '":');
					returnData.factories.forEach(function (factory){
						//helper.Log(req, currentModule, 'getUserData', '     Factory "' + factory.name + '":');
						
						factory.sdls.forEach(function (sdl){
							//helper.Log(req, currentModule, 'getUserData', '        SDL "' + sdl.name + '":');
							
							sdl.properties.forEach(function (property){
								//helper.Log(req, currentModule, 'getUserData', '           Property "' + property.name + '":');

								//helper.Log(req, currentModule, 'getUserData', '              Producer "' + property.producer.name + '":');
								
								if(returnData.user.type > 3){
									//01) milkPrice:                                    FARM -----------------------------------------------------------------------------------------------
									property.milkPrice = createURL('milkPrice', factory.code, sdl.code, property.code, fromDate, toDate);
									
									//02) milkVolume:                                   FARM -----------------------------------------------------------------------------------------------
									property.milkVolume = createURL('milkVolume', factory.code, sdl.code, property.code, fromDate, toDate);
									
									//03) milkQuality :                                 FARM -----------------------------------------------------------------------------------------------
									property.milkQuality = createURL('milkQuality', factory.code, sdl.code, property.code, fromDate, toDate);
									
									//04) milkIncomeReport (Informe de Rendimentos):    PRODUCERS ------------------------------------------------------------------------------------------
									property.milkIncomeReport = createURL('milkIncomeReport', factory.code, sdl.code, property.code, fromDate, toDate);
									
									//05) milkStatements (Demontrativo de Pagamento):   PRODUCERS ------------------------------------------------------------------------------------------
									property.milkStatements =createURL('milkStatements', factory.code, sdl.code, property.code, fromDate, toDate);
									
									//06) milkInvoices (Notas Fiscais):                 PRODUCERS ------------------------------------------------------------------------------------------
									property.milkInvoices = createURL('milkInvoices', factory.code, sdl.code, property.code, fromDate, toDate);
									
									//07) milkQualityReport (Notificações de IN62):     PRODUCERS ------------------------------------------------------------------------------------------
									property.milkQualityReport = createURL('milkQualityReport', factory.code, sdl.code, property.code, fromDate, toDate);
									
									//08) Recents:                                      ALL ------------------------------------------------------------------------------------------------
									property.recents = createURL('recents', factory.code, sdl.code, property.code, fromDate, toDate);
								}
 
							});
						});
					});

					//09) milkPriceFactors:                             PRODUCERS ------------------------------------------------------------------------------------------
					returnData.milkPriceFactors = createURL('milkPriceFactors', null, null, null, null, null);

					//10) milkQualityStandards (Padrões da IN62 atual): ALL ------------------------------------------------------------------------------------------------
					returnData.milkQualityStandards = createURL('milkQualityStandards', null, null, null, null, null);
					
				}

				helper.Log(req, currentModule, 'getUserData', '         Done');

				let sessionTime = config.authentication.sessionTime;

				switch (user.type) {
					case 0:
						sessionTime = config.authentication.sessionTimeProducer;
						break;
					case 1:
						sessionTime = config.authentication.sessionTimeEmployee;
						break;
					case 2:
						sessionTime = config.authentication.sessionTimeEmployee;
						break;
					default:
						sessionTime = config.authentication.sessionTime;
				}

				let result = {
					token: token,
					effort: helper.getElapsedTime(startTime),
					sessionTime : sessionTime,
					data: [returnData]
				};
				
				helper.Log(req, currentModule, 'getUserData', 'Returning data (' + JSON.stringify(result).length + ' bytes) for user "' + user.user + '"' + (user.impersonatedFrom ? ' (user "' + user.impersonatedFrom + '" impersonating user "' + code + '")' : '') + '. Aggregation took ' + helper.getElapsedTime(startTime) + '...');
				
				return res.send(helper.REST.ok(result));
			}else{
				helper.Log(req, currentModule, 'getUserData', 'No return data was found!');
				return next(helper.REST.notFound(currentModule, 'getUserData', 'User "' + code + '"'));
			}
			
		})
		.catch(function (err){
			return next(err);
		});
	
};

function createURL(content, factory, sdl, user, fromDate, toDate){
	return {
		url: config.url.base + '/contents?type=' + content + '&id=' + user +  (factory ? '&factory=' + factory : '') + (sdl ? '&sdl=' + sdl : '') + (fromDate ? '&from=' + fromDate : '') + (toDate ? '&to=' + toDate : '')
	};
}

function _updateUser (id, updateQuery){
	
	return new Promise(function (resolve, reject){
		
		let findQuery = {_id: id};
 
		return db.collection(collectionName).update(findQuery, updateQuery, {upsert: false, multi: false})
			.then( function (updateResult){
				let data = {
					findQuery: findQuery,
					updateQuery: updateQuery.$set || '',
					result: updateResult
				};
				return resolve(helper.audit(null, helper.EVENTS.users.update , data));
			})
			.catch(function (ex) {
				return reject(ex);
			});
	});
	
}
