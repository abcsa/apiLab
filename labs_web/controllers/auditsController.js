'use strict';

let helper = require('../common/helper.js');
let db = require('../common/db.js');
let validation = require('../common/validation.js');
let _ = require('lodash');

let currentModule = 'auditsController.js';
let collectionName = 'audits';


exports.createAudit = function (req, res, next){
	
	helper.Log(req, currentModule, 'createAudit', 'Inserting new audit item...');

	try {
		validation.validateInput('string', req.body.name, true);
		validation.validateInput('object', req.body.obj, false);
	} catch(err){
		return next(helper.REST.badRequest(currentModule, 'createAudit', 'Invalid Parameter: ' + err));
	}

	if(req.body._id || req.body.id){
		return next(helper.REST.badRequest(currentModule, 'createAudit', 'Resource id cannot be specified'));
	}
	
	if (!req.body.name){
		return next(helper.REST.badRequest(currentModule, 'createAudit','Audit name is required'));
	}
	
	if (!req.body.value){
		return next(helper.REST.badRequest(currentModule, 'createAudit','Audit value is required'));
	}
	
	let itemData = {
		name: req.body.name || '',
		value: req.body.value || ''
	};
	
	helper.audit(req, helper.EVENTS.audits.create, itemData)
		.then(function (){
			return res.send(helper.REST.ok(itemData));
		})
		.catch(function (ex){
			return next(ex);
		});
	
};
