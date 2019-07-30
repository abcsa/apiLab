'use strict';

let mongoClient = require('mongodb').MongoClient;
let helper = require('../common/helper.js');
let config = require('../common/config.js');
let _ = require('lodash');

let currentModule = 'db.js';

const logDetails = false;
let database;
let allowedCollection = [
	'audits',
	'tokens',
	'users',
];

exports.setup = function (databaseName){
	
	helper.Log(null, currentModule, 'setup', '      Initializing database module...');
	
	if (!databaseName) {
		throw helper.REST.internalServerError(currentModule, 'setup', 'Unknown database name (' + databaseName + ')!');
	}
	
	return _connect(databaseName)
		.then(function (db){
			database = db;
			database.collections = [];

			database.on('close', function (){
				helper.Log(null, currentModule, 'db.close', 'Database "' + database.databaseName + '" connection was closed...');
			});
			
			database.on('timeout', function (){
				helper.Log(null, currentModule, 'db.timeout', 'Database "' + database.databaseName + '" connection timed out!');
			});
			
			database.serverConfig.on('left', function (type, server){
				helper.Log(null, currentModule, 'db.serverConfig.left', 'Server "' + server.me + '" (' + type + ') left "' + (server.setName || server.ismastar.setName) + '".');
			});
			
			database.serverConfig.on('joined', function (type, server){
				helper.Log(null, currentModule, 'db.serverConfig.joined', 'Server "' + server.me + '" (' + type + ') joined "' + (server.setName || server.ismastar.setName) + '".');
			});
			
			helper.Log(null, currentModule, 'setup', '         Setting up database collections:');

			let setupPromise = Promise.resolve();
			let setupPromises = allowedCollection.map(function (collectionName) {
				setupPromise = setupPromise
					.then(function (){
						return _setupCollection(collectionName);
					});
				return setupPromise;
			});
			
			return Promise.all(setupPromises)
				.then(function (ret){
					helper.Log(null, currentModule, 'setup', '         All ' + setupPromises.length + ' collections were initialized');
					return ret;
				})
				.catch(function (ex){
					throw ex;
				});
			
		})
		.catch(function (err){
			throw err;
		});
	
};

exports.collection = function (collectionName){
	
	let c = database.collections[collectionName];
	if (!c) {
		throw new Error('Collection "' + collectionName + '" was not found or was not initialized!');
	}
	
	return c;
	
};


function _setupCollection (collectionName){
	
	helper.Log(null, currentModule, 'setupCollection', '            Requesting setup of collection "' + collectionName + '"...');
	
	return new Promise(function (resolve, reject){
		
		return database.createCollection(collectionName, function (err, collection){
			
			if (err) {
				helper.Log(null, currentModule, 'setupCollection', '               Collection "' + collectionName + '" error: ' + err);
				throw err;
			}
			
			let myCol = database.collection(collectionName);

			let indexes = [];

			/* eslint-disable camelcase */
			switch (collectionName) {
				
				case 'audits':
					indexes.push({
						index: {_id: 1, name: 1, code: 1, 'data.collection': 1 },
						options: {name: 'idx_' + collectionName + '_id_name_code_data.collection', _id: 1, background: true, sparse: false}
					});
					break;

				case 'tokens':
					indexes.push({
						index: {_id: 1, jti: 1, ttyp: 1, aud: 1, sub: 1},
						options: {name: 'idx_' + collectionName + '_id_jti_ttyp_aud_sub', background: true, unique: true, sparse: true}
					});
					break;

				case 'users':
					indexes.push({
						index: {_id: 1},
						options: {name: 'idx_' + collectionName + '_id'}
					});
					indexes.push({
						index: {user: 1},
						options: {name: 'idx_' + collectionName + '_email', background: true, unique: true, sparse: true}
					});
					break;
 
				default:
					break;
			}
			/* eslint-enable camelcase */

			myCol.find = function (findQuery, options, returnCursor, cursorLimit){
				return _find (collection, findQuery, options, returnCursor, cursorLimit);
			};
			
			myCol.insert = function (insertQuery, options) {
				return _insert(collection, insertQuery, options);
			};
			
			myCol.update = function (findQuery, updateQuery, options){
				return _update(collection, findQuery, updateQuery, options);
			};
			
			myCol.delete = function (findQuery, options){
				return _remove (collection, findQuery, options);
			};
			
			myCol.aggregate = function (aggregateQuery, options){
				return _aggregate(collection, aggregateQuery, options);
			};
			
			database.collections[collectionName] = myCol;

			if (indexes.length > 0) {
				helper.Log(null, currentModule, 'setupCollection', '               Creating indexes of collection  "' + collectionName + '":');
			}else{
				helper.Log(null, currentModule, 'setupCollection', '               Collection "' + collectionName + '" has no indexes defined.');
			}
			
			let indexPromise = Promise.resolve();
			let indexesPromises = indexes.map(function (index) {
				
				indexPromise = indexPromise
					.then(function (){
						return myCol.createIndex(index.index , index.options)
						//return myCol.create(index.index , index.options)
							.then(function (){
								helper.Log(null, currentModule, 'setupCollection', '                  Index "' + index.options.name + '" created.');
								return true;
							})
							.catch(function (ex){
								throw(ex);
							});
					});
				
				return indexPromise;
				
			});
 
			return Promise.all(indexesPromises)
				.then(function (){
					helper.Log(null, currentModule, 'setupCollection', '               Collection "' + collectionName + '" is ok.');
					return resolve();
				})
				.catch(function (ex){
					return reject(ex);
				});
			
		});
	});
	
}

function _connect (){
	
	helper.Log(null, currentModule, 'connect', '         Connecting to database "' + config.db.uri + '"...');
	return mongoClient.connect(config.db.uri)
		.then(function (db){
			helper.Log(null, currentModule, 'connect', '            Server is now connected to database "' + db.databaseName + '".');
			return db;
		})
		.catch( function (ex) {
			helper.Log(null, currentModule, 'connect', '            Error connecting to "' + config.db.uri + '": ' + ex);
			throw ex;
		});

}

function _find (collection, findQuery, optionQuery, returnCursor, cursorLimit){
	
	optionQuery = _.merge(optionQuery, {});
	
	helper.Log(null, currentModule, 'find', 'Searching ("' + collection.collectionName + '") using query "' + JSON.stringify(findQuery) + '"...');

	findQuery = helper.preDatabase(findQuery);
	
	let cursor;
	if(cursorLimit){
		cursor = collection.find(findQuery, optionQuery).limit(cursorLimit);
	}else{
		cursor = collection.find(findQuery, optionQuery);
	}
	
	if(returnCursor){
		return cursor;
	}else{
		return cursor.toArray()
			.then(function (ret){
				ret = helper.posDatabase(ret);
				
				if (logDetails){
					helper.Log(null, currentModule, 'find', '   Database ("' + collection.collectionName + '") returned "' + (ret && ret[0] ? JSON.stringify(ret[0]) : 'no data') + '".');
				}else{
					//helper.Log(null, currentModule, 'find', '   Database ("' + collection.collectionName + '") returned "' + (ret && ret[0] ? JSON.stringify(ret[0]).length + ' bytes' : 'no data') + '".');
					helper.Log(null, currentModule, 'find', '   Database ("' + collection.collectionName + '") ' + getReadableDbReturn(ret) + '.');
				}

				return ret;
			})
			.catch(function (ex){
				throw ex;
			});
	}

}

function _insert (collection, insertQuery, optionQuery ) {
	
	let defaultUpdateOption = {
		upsert: true,
		returnNewDocument: true
	};
	optionQuery = _.merge(defaultUpdateOption , optionQuery);
	
	let findQuery = {_id: insertQuery._id ? insertQuery._id : helper.newUUID()};

	if (collection.collectionName === 'audits'){
		helper.Log(null, currentModule, 'insert', 'Inserting audit item (name: "' + insertQuery.name + '"' + ( insertQuery.code ? ', code: "' + insertQuery.code + '"' : '') + ', size: ' + JSON.stringify(insertQuery).length + ' bytes)...');
	}else{
		helper.Log(null, currentModule, 'insert', 'Inserting ("' + collection.collectionName + '") using query "' + JSON.stringify(insertQuery) + '"...');
	}

	findQuery = helper.preDatabase(findQuery);
	insertQuery = helper.preDatabase(insertQuery);

	return collection.findOneAndUpdate(findQuery, insertQuery, optionQuery)
		.then(function (ret) {
			ret = helper.posDatabase(ret);
			

			if (logDetails){
				if (collection.collectionName !== 'audits'){
					helper.Log(null, currentModule, 'insert', '   Database ("' +  collection.collectionName + '") returned "' + JSON.stringify(ret) + '"...');
				}
			}else {
				helper.Log(null, currentModule, 'insert', '   Database ("' + collection.collectionName + '") ' + getReadableDbReturn(ret) + '.');
			}
			
			return ret;
		})
		.catch(function (ex) {
			throw ex;
		});
}

function _update (collection, findQuery, updateQuery, optionQuery){
	
	let defaultUpdateOption = {
		upsert: true,
		multi: false
	};
	
	optionQuery = _.merge(defaultUpdateOption , optionQuery);
	
	helper.Log(null, currentModule, 'update', 'Updating ("' + collection.collectionName + '") using findQuery "' + JSON.stringify(findQuery) + '" and updateQuery "' + JSON.stringify(updateQuery) + '"...');
	
	findQuery = helper.preDatabase(findQuery);
	updateQuery = helper.preDatabase(updateQuery);
	
	return collection.update(findQuery, updateQuery, optionQuery)
		.then(function (ret){
			
			ret = helper.posDatabase(ret);
			helper.Log(null, currentModule, 'update', '   Database ("' + collection.collectionName + '") ' + getReadableDbReturn(ret.result) + '.');

			return ret;
			
		})
		.catch(function (ex){
			throw ex;
		});
}

function _remove (collection, findQuery, optionQuery){
	
	optionQuery = _.merge(optionQuery, {});
	
	helper.Log(null, currentModule, 'remove', 'Deleting ("' + collection.collectionName + '") using query "' + JSON.stringify(findQuery) + '"...');
	
	findQuery = helper.preDatabase(findQuery);
	
	return collection.remove (findQuery, optionQuery)
		.then(function (ret){
			
			ret = helper.posDatabase(ret);
			helper.Log(null, currentModule, 'remove', '   Database returned "' + JSON.stringify(ret) + '"...');
			return ret;
			
		})
		.catch(function (ex){
			throw ex;
		});

}

function _aggregate (collection, aggregateQuery, optionQuery){
	
	optionQuery = _.merge(optionQuery, {});
	
	helper.Log(null, currentModule, 'aggregate', 'Aggregating ("' + collection.collectionName + '") using a query of ' + JSON.stringify(aggregateQuery).length + ' bytes...');

	aggregateQuery = helper.preDatabase(aggregateQuery);
	
	return collection.aggregate(aggregateQuery, optionQuery).toArray()
		.then(function (ret){
			
			ret = helper.posDatabase(ret);
			helper.Log(null, currentModule, 'aggregate', '   Database ("' + collection.collectionName + '") ' + getReadableDbReturn(ret) + '.');
			return ret;
			
		})
		.catch(function (ex){
			throw ex;
		});

}

function getReadableDbReturn (ret){

	try{
		if(ret.ok){
			if (ret.ok === 1) {
				
				let found   = (ret.n > 0 ? 'found ' + ret.n + ' item' + (ret.n === 1 ? '' : 's') : 'did not find any item');
				let updated = (ret.nModified > 0 ? 'updated ' + ret.nModified + ' item' + (ret.nModified > 1 ? 's' : '') : 'did not update any item') ;
				let upserted;
				
				if (ret.lastErrorObject && ret.lastErrorObject.upserted) {
					upserted = [{_id: ret.lastErrorObject.upserted}];
				}
				if (ret.upserted) {
					upserted =ret.upserted;
				}
				
				if(upserted){
					let ids = upserted.map(function (item){
						return item._id;
					}).join(', ').trim();
					
					let inserted = (upserted.length > 0 ? 'inserted ' + upserted.length + ' item' + (upserted.length > 1 ? 's' : '') + (upserted.length > 0 ? ' (' + ids + ')' : '') : 'did not insert any item');
					return (ret.n > 1 ? found : '') + (ret.nModified > 0 ? (ret.n > 1 ? ', ' : '') + updated : '') + (ret.n > 1 || ret.nModified > 0 ? ' and ' : '') + inserted;
				}else{
					return (ret.n > 1 ? found : '') + (ret.n > 1 ? ' and ' : '') + updated;
				}
				
			}else{
				return 'failed to update item and returned "' + JSON.stringify(ret) + '"';
			}
		}else{
			if(_.isArray(ret)){
				return 'returned ' + (ret.length > 0 ? (ret.length === 1 ? 'an item with ' + JSON.stringify(ret[0]).length + ' bytes.' : ret.length + ' items') : 'no data');
			}else{
				return 'returned object "' + JSON.stringify(ret) + '"';
			}
		}
	}catch(ex){
		helper.Log(null, currentModule, 'getReadableDbReturn', 'Error getting a readable string from result: ' + ex);
		return 'returned object "' + JSON.stringify(ret) + '"';
	}

}