/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
/* global console, requirejs */

/**
 * This module extends the notebook to allow dashboard creation and viewing.
 */
define([
    'require',
    './dashboard-actions',
    '../link-css'
], function(
    require,
    DashboardActions,
    linkCSS
) {
    'use strict';

    // use global require.js to setup the paths for our dependencies
    requirejs.config({
        packages: [
            { name: 'urth-common', location: require.toUrl('../dashboard-common').split('?')[0] }
        ],
        paths: {
            Gridstack: require.toUrl('../bower_components/gridstack/dist/gridstack.min.js'),
            lodash: require.toUrl('../bower_components/lodash/lodash.js')
            // jquery-ui is already loaded by Notebook, as 'jqueryui'
        },
        map: {
            // Gridstack uses jquery-ui 1.11 (supports AMD) while notebook uses 1.10 (non-amd).
            // Map Gridstack to the old non-AMD jquery-ui used by notebook.
            Gridstack: {
                'jquery-ui/core': 'jqueryui',
                'jquery-ui/mouse': 'jqueryui',
                'jquery-ui/widget': 'jqueryui',
                'jquery-ui/resizable': 'jqueryui',
                'jquery-ui/draggable': 'jqueryui'
            }
        }
    });

    linkCSS('./dashboard-view/dashboard-actions.css');

    var dashboard;

    var dbActions = new DashboardActions({
        enterDashboardMode: function(doEnableGrid) {
            require(['./dashboard'], function(Dashboard) {
                if (!dashboard) {
                    dashboard = Dashboard.create({
                        container: $('#notebook-container'),
                        numCols: 12,
                        rowHeight: 20,
                        gridMargin: 10,
                        defaultCellWidth: 4,
                        defaultCellHeight: 4,
                        minCellHeight: 2,
                        exit: function() {
                            dbActions.switchToNotebook();
                        }
                    });
                }
                dashboard.setInteractive(doEnableGrid);
            });
        },
        exitDashboardMode: function() {
            dashboard.destroy();
            dashboard = null;
        },
        showAll: function() {
            dashboard.showAllCells();
        },
        hideAll: function() {
            dashboard.hideAllCells();
        }
    });
    dbActions.addMenuItems();
    dbActions.addToolbarItems();
});
