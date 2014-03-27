(function(Storm, _, _window, _document, undefined) {

		/**
		 * Stores created apps
		 * @type {Array}
		 */
	var _apps = [],
		/** @type {Storm.Events} */
		_observable = Storm.Events.construct(),
		/**
		 * Track if the document is ready
		 * @type {Boolean}
		 */
		_isDocReady = false,
		/**
		 * How many locks are active in preventing
		 * apps from starting
		 * @type {Number}
		 */
		_lockBarrier = 0;

	// When document.ready trigger all registered apps to start
	_document.ready(function() {
		_isDocReady = true;
		_observable.trigger('document:ready');
	});
	// On unload, trigger unload on the apps
	_window.on('beforeunload', function() {
		_observable.trigger('window:unload');
	});

	var _runChecks = function() {
		_.each(_apps, function(app) {
			app._check();
		});
	};

	/**
	 * Centralized start point for an application and
	 * allows multiple, separate apps to run side-by-side.
	 * Also reduces bindings to the DOM on window load/unload
	 * and document ready.
	 * @class App
	 */
	var App = Storm.Module.extend(function() {
		_apps.push(this);

		/**
		 * Holds the configuration for this app
		 * @type {Object}
		 */
		this.config = {};

		/**
		 * Holds the setup calls
		 * @type {Array[Function]}
		 */
		this.setupCalls = [];

		/**
		 * Holds the end call
		 * @type {Function}
		 */
		this.endCall = null; // Only one end call

		/**
		 * Holds the start call
		 * @type {Function}
		 */
		this.startCall = null;

		/**
		 * Track whether the app has been initialized.
		 * Need to know so that an unload call is not executed
		 * on an app that never loaded
		 * @type {Boolean}
		 */
		this._hasInitialized = false;

		/**
		 * @type {Boolean}
		 */
		this._isIgnited = false;

		this._initialize = _.once(_.bind(this._initialize, this)); // Initialize only once
		this._unload = _.once(_.bind(this._unload, this)); // Unload only once

		this._bindAutoStart();
		this._bindAutoEnd();

	}, {
		_check: function() {
			if (_lockBarrier > 0) { return; }
			if (this._isIgnited || _isDocReady) { this._initialize(); }
		},

		/**
		 * By default, the app will startup on document.ready
		 * @type {Boolean}
		 */
		autoStart: true,

		/**
		 * Bind the autostart events
		 * @private
		 */
		_bindAutoStart: function() {
			if (!this.autoStart) { return; }

			if (_isDocReady) {
				return this._check();
			}

			_observable.on('document:ready', _.bind(this._check, this));
		},

		/**
		 * By default, the app will end on window beforeunload
		 * @type {Boolean}
		 */
		autoEnd: true,

		/**
		 * Bind the autoend events
		 * @private
		 */
		_bindAutoEnd: function() {
			if (!this.autoEnd) { return; }
			_observable.on('window:unload', _.bind(this._unload, this));
		},

		/**
		 * A configuration object or key, value pair
		 * that will extend this apps' configuration
		 * @param  {String || Object} key
		 * @param  {Value}  value
		 * @return {App}
		 */
		configure: function(key, value) {
			if (!_.isString(key)) {
				_.extend(this.config, key);
				return this;
			}

			this.config[key] = value;
			return this;
		},

		/**
		 * A setup function to run before the app starts.
		 * This function will still wait until document.ready
		 * to execute.
		 * @param  {Function} func
		 * @return {App}
		 */
		setup: function(func) {
			if (!_.isFunction(func)) { console.error('Setup must have a function.'); }
			this.setupCalls.push(func);
			return this;
		},

		/**
		 * Function that executes when the app starts
		 * @param  {Function} func
		 * @return {App}
		 */
		start: function(func) {
			if (!_.isFunction(func)) { console.error('Start must have a function.'); }
			this.startCall = func;
			return this;
		},

		/**
		 * Function that executes when the app ends
		 * @param  {Function} func
		 * @return {App}
		 */
		end: function(func) {
			if (!_.isFunction(func)) { console.error('End must have a function.'); }
			this.endCall = func;
			return this;
		},

		/**
		 * The app can be started manually without waiting
		 * for the document ready.
		 * @return {App}
		 */
		ignite: function() {
			this._isIgnited = true;
			this._check();
			return this;
		},

		/**
		 * The app can be unloaded manually without waiting
		 * for a window unload event.
		 * @return {App}
		 */
		smother: function(opts) {
			if (!this._hasInitialized) { return this; }

			opts = opts || {};
			if (!opts.isSilent) { this._unload(); }

			return this;
		},

		/**
		 * Initialize. If no startCall is present, create one
		 * so that the app can continue
		 * @private
		 */
		_initialize: function() {
			this.startCall = this.startCall || function() {};

			this._hasInitialized = true;

			this.trigger('setup:before', this.config);

			this._callSetup();

			this.trigger('setup:after', this.config);

			this.trigger('start:before', this.config);

			this._callStart();

			this.trigger('start:after', this.config);
		},

		/**
		 * Call all setup functions
		 * Clear the setup functions after their
		 * executed to keep them from being executed again
		 * @private
		 */
		_callSetup: function() {
			// Call the functions in the order
			// they were registered
			var idx = 0, length = this.setupCalls.length;
			for (; idx < length; idx++) {
				this.setupCalls[idx].call(null, this.config);
			}
			// After setup calls are made, clear the calls
			// so that they're not called again
			this.setupCalls.length = 0;
		},

		/**
		 * Call start and trigger events.
		 * Nullify the start call after it's executed
		 * to keep it from being executed again
		 * @private
		 */
		_callStart: function() {
			this.startCall.call(null, this.config);
			this.startCall = null;
		},

		/**
		 * Unload
		 * @private
		 */
		_unload: function() {
			// Never initialized, don't unload
			if (!this._hasInitialized) { return; }

			if (this.endCall) { this.endCall.call(null, this, this.config); }
			this.trigger('end');
		}
	});

	App.lock = function() {
		_lockBarrier++;
	};

	App.unlock = function() {
		_lockBarrier--;
		_runChecks();
	};

	Storm.mixin({
		apps: _apps,
		app: new App(), // A base starting point for the application
		App: App
	});

}(Storm, _, $(window), $(document)));
