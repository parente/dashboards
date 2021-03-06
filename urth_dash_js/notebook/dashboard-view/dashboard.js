/**
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

/*************
  Urth dashboard metadata structure:
    "metadata": {
         "urth": {
             "dashboard": {
                 "layout": {
                     "col":
                     ...
                 },
                 "hidden": false
             }
         }
    }
 **************/

define([
    'jquery',
    'lodash',
    'base/js/namespace',
    'urth-common/error-log',
    '../link-css',
    'urth-common/gridstack-custom' // jquery plugin: return value not used
], function(
    $,
    _,
    IPython,
    ErrorLog,
    linkCSS
) {
    'use strict';

    var cssLoaded = false;
    var idCounter = 0;

    var Dashboard = function(opts) {
        this.$container = $(opts.container);
        this.opts = opts;
        this._loaded = $.Deferred();

        ErrorLog.enable(IPython);

        var gridCssLoaded = cssLoaded;
        if (!cssLoaded) {
            gridCssLoaded = linkCSS('./bower_components/gridstack/dist/gridstack.css');
            linkCSS('./dashboard-common/gridstack-overrides.css');
            linkCSS('./dashboard-common/dashboard-common.css');
            linkCSS('./dashboard-view/dashboard-view.css');
            cssLoaded = true;
        }

        // Must wait for CSS to be evaluated before we generate the grid. Otherwise, positioning
        // is calculated incorrectly.
        $.when(gridCssLoaded).then(function() {
            $('body').addClass('urth-dashboard');
            this._initGridMetadata();
            var nolayout = this._addMetadataToDom(); // returns cells that don't have metadata

            this._enableGridstack();
            this._calcCellWidth(); // now that Gridstack has been enabled

            nolayout.forEach(this._addNotebookCellToDashboard.bind(this)); // handle cells without grid layout metadata
            this._createHiddenContainer(); // create a container to hold hidden cells

            if (nolayout.length > 0) {
                this._saveGrid(); // save notebook if any new layout metadata was created
            }

            $(window).on('resize', _.debounce(this._calcCellWidth.bind(this), 200));

            this._loaded.resolve();
        }.bind(this));

    };

    Dashboard.prototype._calcCellWidth = function() {
        this._cellMinWidthPX = Math.floor(this.$container.width() / this.opts.numCols) -
                                         this.opts.gridMargin;
    };

    // creates empty dashboard metadata (if necessary)
    Dashboard.prototype._initGridMetadata = function() {
        function _urthMetdata(metadata) {
            var urth = metadata.urth = metadata.urth || {};
            urth.dashboard = urth.dashboard || {};
            return urth;
        }

        // init notebook metadata
        _urthMetdata(IPython.notebook.metadata);
        $.extend(IPython.notebook.metadata.urth.dashboard, {
            defaultCellHeight: this.opts.rowHeight,
            cellMargin: this.opts.gridMargin,
            maxColumns: this.opts.numCols
        });

        // init cell metadata
        var self = this;
        this.$container.find('.cell').each(function(idx) {
            _urthMetdata(self._getCellMetadata($(this)));
        });
    };

    // Adds cell metadata to DOM. Returns DOM nodes for which there is no metadata.
    Dashboard.prototype._addMetadataToDom = function() {
        var nolayout = [];
        this.$container.addClass('grid-stack');
        var self = this;
        this.$container.find('.cell').each(function(idx) {
            // Gridstack expects horizontal margins to be handled within the cell. To accomplish
            // that, we need to wrap the cell contents in an element.
            var el = $(this);
            if (el.find('> .dashboard-item-background').length === 0) {
                el.prepend('<div class="dashboard-item-background">');
            }

            var metadata = self._getCellMetadata(el);
            if (!metadata.urth.dashboard.hidden) {
                if (metadata.urth.dashboard.layout) {
                    var layout = metadata.urth.dashboard.layout;
                    self._initVisibleCell(el, layout);
                } else {
                    nolayout.push(this); // cell doesn't have layout info; save for later
                }
            }
        });
        return nolayout;
    };

    Dashboard.prototype._enableGridstack = function() {
        this.gridstack = this.$container.gridstack({
                vertical_margin: this.opts.gridMargin,
                cell_height: this.opts.rowHeight,
                width: this.opts.numCols,
                animate: true,
                draggable: {
                    handle: '.drag-handle',
                    scroll: true
                },
                resizable: {
                    handles: 'e, se, s, sw, w'
                }
            })
            .on('dragstop resizestop', this._saveGrid.bind(this)) // TODO: use `onchange` instead?
            .on('dragstart dragstop', function(event) {
                $('body').toggleClass('dragging', event.type === 'dragstart');
            })
            .data('gridstack');

        // setup dynamic style rules which depend on margin size
        var halfMargin = this.opts.gridMargin / 2;
        var styleRules = [
            // position background across cell, with margins on sides
            {
                selector: '.grid-stack .grid-stack-item .dashboard-item-background',
                rules: 'left: ' + halfMargin + 'px; right: ' + halfMargin + 'px;'
            },

            // set horizontal margin on cell contents
            {
                selector: '.grid-stack .grid-stack-item.cell > :not(.dashboard-item-background):not(.ui-resizable-handle):not(.grid-control-container)',
                rules: 'margin: 0 ' + halfMargin + 'px;'
            },

            // set placeholder size to match; pass "#notebook-container" to make this rule have precedence
            {
                selector: '#notebook-container.grid-stack .grid-stack-placeholder > .placeholder-content',
                rules: 'left: ' + halfMargin + 'px; right: ' + halfMargin + 'px;'
            },

            // offset grid controls
            {
                selector: '.grid-stack .grid-stack-item .grid-control-container.grid-control-ne',
                rules: 'right: ' + halfMargin + 'px;'
            },
            {
                selector: '.grid-stack .grid-stack-item .grid-control-container.grid-control-nw',
                rules: 'left: ' + halfMargin + 'px;'
            },

            // Place resize handles
            {
                selector: '.grid-stack .grid-stack-item > .ui-resizable-se',
                rules: 'right: ' + (halfMargin+5) + 'px;'
            },
            {
                selector: '.grid-stack .grid-stack-item > .ui-resizable-sw',
                rules: 'left: ' + (halfMargin+5) + 'px;'
            }
        ];
        this.gridstack.generateStylesheet(styleRules);

        this.gridstack.enable(); // enable widgets moving/resizing
    };

    // computes metadata for a cell that doesn't have grid layout metadata
    Dashboard.prototype._addNotebookCellToDashboard = function(cell) {
        var $cell = $(cell).css({ visibility: 'hidden', display: 'block' });

        var dim = this._computeCellDimensions($cell);
        if (!dim.isEmpty) {
            this.gridstack.add_widget($cell, 0, 0, dim.width, dim.height, true, false /* attach_node */);
            this._initVisibleCell($cell);
        }

        $cell.css({ visibility: '', display: '' });
    };

    Dashboard.prototype._createHiddenContainer = function() {
        this.$hiddenContainer = $('<div id="dashboard-hidden-container" class="container hidden"/>')
            .insertAfter(this.$container);
        var $header = $('<div class="header"/>')
            .appendTo(this.$hiddenContainer)
            .append('<h2 class="title">Hidden Cells</h2>');
        $('<button class="btn btn-xs">Show code</button>')
            .appendTo($header)
            .click(this._toggleHiddenCellCode.bind(this));

        // add hidden cells to the hidden container
        var self = this;
        this.$container
            .find('> :not(.grid-stack-item)')
            .each(function() {
                self._hideCellDom($(this), true /* batch */);
            });
    };

    Dashboard.prototype._getCellMetadata = function($elem) {
        if ($elem.is('.cell')) {
            return $elem.data('cell').metadata; // pull cell metadata from element data
        }
        var $cell = this._getParentCell($elem);
        if ($cell.length) {
            return this._getCellMetadata($cell);
        }
    };

    // Update cell's metadata.
    // Set `batch` to true if updating multiple cells. Will need to call `save_notebook` afterwards.
    Dashboard.prototype._updateCellMetadata = function($cell, layout, batch) {
        var metadata = this._getCellMetadata($cell);
        if (layout) {
            metadata.urth.dashboard.layout = layout;
            delete metadata.urth.dashboard.hidden;
        } else {
            delete metadata.urth.dashboard.layout;
            metadata.urth.dashboard.hidden = true;
        }
        if (!batch) {
            IPython.notebook.save_notebook();
        }
    };

    // For a given DOM element, return the Notebook cell which contains it. Works with both
    // Notebook and "hidden" cells.
    Dashboard.prototype._getParentCell = function(elem) {
        var $elem = $(elem);
        var $parent = $elem.parents('.cell.grid-stack-item').first();
        if ($parent.length === 0) {
            var $clone = $elem.parents('[data-dashboard-id]');
            var id = $clone.attr('data-dashboard-id');
            $parent = this.$container.find('[data-dashboard-id=' + id + ']').first();
        }
        return $parent;
    };

    var gridControlsTpl =
        '<div class="grid-control-container grid-control-nw">' +
            '<i class="grid-control drag-handle fa fa-arrows fa-fw"></i>' +
            '<i class="grid-control edit-btn fa fa-pencil fa-fw"></i>' +
        '</div>' +
        '<div class="grid-control-container grid-control-ne">' +
            '<i class="grid-control close-btn fa fa-close fa-fw"></i>' +
        '</div>';

    Dashboard.prototype._addGridControls = function($cell) {
        var self = this;
        if ($cell.find('.grid-control-nw').length === 0) {
            var gc = $(gridControlsTpl).appendTo($cell);
            gc.find('.close-btn').click(function() {
                    self._hideCell(self._getParentCell(this));
                });
            gc.find('.edit-btn').click(function() {
                    var $cell = self._getParentCell(this);
                    self.opts.exit();

                    // select cell and put it in edit mode
                    var nbCell = $cell.data('cell');
                    var nbIndex = IPython.notebook.find_cell_index(nbCell);
                    IPython.notebook.select(nbIndex).edit_mode(nbCell);

                    $cell.get(0).scrollIntoView({ behavior: 'smooth' }); // scroll cell into view
                    $cell.one('animationend', function() {
                        $cell.removeClass('edit-select'); // cleanup
                    });
                    $cell.addClass('edit-select'); // commence highlight animation
                });
        }
    };

    Dashboard.prototype._removeGridControls = function($cell) {
        $cell.find('.grid-control-nw').remove();
    };

    Dashboard.prototype._initVisibleCell = function($cell, layout) {
        if (layout) {
            var computedLayout;
            if (!layout.width || !layout.height) {
                computedLayout = this._computeCellDimensions($cell);
            }
            var width = layout.width || computedLayout.width;
            var height = layout.height || computedLayout.height;

            $cell
                .attr('data-gs-x', layout.col)
                .attr('data-gs-y', layout.row)
                .attr('data-gs-width', width)
                .attr('data-gs-height', height);
        }
        $cell
            .addClass('grid-stack-item')
            .attr('data-gs-min-height', this.opts.minCellHeight);

        this._addGridControls($cell);
    };

    Dashboard.prototype._compute_cell_dim = function($cell, defaultX, defaultY) {
        var self = this;
        var selectors = ['.text_cell_render', '.output', '.widget-area'];
        var computedY = selectors.map(function(selector) {
                var elem = $cell.find(selector).get(0);
                var outerHeight = elem ? elem.offsetHeight : 0; //$cell.find(selector).outerHeight();
                return outerHeight ?
                    Math.ceil((outerHeight + self.opts.gridMargin) / (self.opts.rowHeight + self.opts.gridMargin)) : 0;
            })
            .reduce(function(prev, y) {
                return prev + y;
            }, 0);
        var y = Math.max(computedY, defaultY);

        var computedX = selectors.map(function(selector) {
                var maxWidth = $cell.find(selector + ' *').toArray().reduce(function(prev, elem) {
                    return Math.max(prev, elem.offsetWidth);
                }, 0);
                return Math.ceil((maxWidth + self.opts.gridMargin) / (self._cellMinWidthPX + self.opts.gridMargin));
            })
            .reduce(function(prev, x) {
                return Math.max(prev, x);
            });
        var x = Math.max(computedX, defaultX);

        return {
            width: x,
            height: y,
            isEmpty: computedY === 0 || computedX === 0 // If cell has no visible output
        };
    };

    /**
     * Computes the minimum number of rows & columns needed to show the specified cells contents.
     * @param  {jQuery} $cell - Cell to measure
     * @return {Object} Object of the form:
     *                     {
     *                         width: <number of columns>,
     *                         height: <number of rows>,
     *                         isEmpty: <true if cell has no visible contents, else false>
     *                     }
     */
    Dashboard.prototype._computeCellDimensions = function($cell) {
        $cell.css({
            width: this.opts.defaultCellWidth * (this._cellMinWidthPX + this.opts.gridMargin) - this.opts.gridMargin,
            height: this.opts.defaultCellHeight * (this.opts.rowHeight + this.opts.gridMargin) - this.opts.gridMargin,
            transition: 'none', // disable transitions to allow proper width/height calculations
            display: 'block' // override `display:flex` set by Notebook CSS to allow proper calcs
        });

        var dim = this._compute_cell_dim($cell, this.opts.defaultCellWidth, this.opts.defaultCellHeight);

        // for text cells, if they are taller than the default, recalculate with max width
        if ($cell.hasClass('text_cell') && dim.height > this.opts.defaultCellHeight) {
            $cell.css({ width: this.opts.numCols * this._cellMinWidthPX });
            dim = this._compute_cell_dim($cell, this.opts.numCols, this.opts.defaultCellHeight);
        }

        $cell.css({ width: '', height: '', transition: '', display: '' });
        return dim;
    };

    Dashboard.prototype._saveGrid = function() {
        // save each cell's metadata
        var widgetData = _.map($('.grid-stack .cell.grid-stack-item:visible'), function (el) {
            el = $(el);
            var node = el.data('_gridstack_node');
            return {
                col: node.x,
                row: node.y,
                width: node.width,
                height: node.height
            };
        });

        var self = this;
        $('.cell.grid-stack-item').each(function(idx) {
            var layout = $.extend({}, widgetData[idx]);  // clone `data` object
            self._updateCellMetadata($(this), layout, true);
        });

        IPython.notebook.save_notebook();
    };

    Dashboard.prototype._hideCell = function($cell, batch, prepend) {
        prepend = typeof prepend === 'undefined' ? true : prepend;
        var self = this;
        this.$container.one('change', function() {
            $cell.resizable('destroy');
            $cell.draggable('destroy');
            self._hideCellDom($cell, batch, prepend);
        });
        this.gridstack.remove_widget($cell, false /* don't detach node */);
    };

    var showCellControlTpl =
        '<div class="grid-control-container grid-control-ne">' +
            '<i class="grid-control add-btn fa fa-plus fa-fw"></i>' +
        '</div>';

    // remove cell from main grid and show in hidden table
    Dashboard.prototype._hideCellDom = function($cell, batch, doPrepend) {
        this._updateCellMetadata($cell, null, batch);
        $cell.removeClass('grid-stack-item');
        var $clone = $cell
            .attr('data-dashboard-id', idCounter++)
            .clone();
        if (doPrepend) {
            $clone.insertAfter(this.$hiddenContainer.find('> .header'));
        } else {
            $clone.appendTo(this.$hiddenContainer);
        }

        // add close button to cloned cell
        $(showCellControlTpl)
            .appendTo($clone)
            .click(this._showCell.bind(this, $clone));

        // recreate grid controls because we don't want to clone all event handlers
        this._removeGridControls($clone);
        this._addGridControls($clone);

        this.$hiddenContainer.removeClass('hidden');
    };

    // move cell from hidden table to main grid
    Dashboard.prototype._showCell = function($clone, batch) {
        var dim = this._computeCellDimensions($clone);

        var id = $clone.attr('data-dashboard-id');
        $clone.remove();
        if (this.$hiddenContainer.find('.cell').length === 0) {
            this.$hiddenContainer.addClass('hidden');
        }

        var $cell = $('#notebook-container').find('[data-dashboard-id=' + id +']');
        this.gridstack.add_widget($cell, 0, 0, dim.width, dim.height, true, false /* attach_node */);
        this._initVisibleCell($cell);

        // update metadata
        var grid = $cell.data('_gridstack_node');
        var layout = {
            col: grid.x,
            row: grid.y,
            width: grid.width,
            height: grid.height
        };
        this._updateCellMetadata($cell, layout, batch);
    };

    Dashboard.prototype._toggleHiddenCellCode = function(evt) {
        $('#dashboard-hidden-container').toggleClass('show-code');
        var $button = $(event.target);
        $button.toggleClass('btn-info');
        $button.text($button.text() === 'Show code' ? 'Hide code' : 'Show code');
    };

    /**
     * Move all cells into the dashboard view
     */
    Dashboard.prototype.showAllCells = function() {
        var self = this;
        $('#dashboard-hidden-container > .cell')
            .each(function() {
                self._showCell($(this), true /* batch */);
            });
        IPython.notebook.save_notebook();
    };

    /**
     * Remove all cells from the dashboard view. Cells will be shown in the 'hidden' container.
     */
    Dashboard.prototype.hideAllCells = function() {
        var self = this;
        this.$container
            .find('.cell.grid-stack-item')
            .each(function() {
                self._hideCell($(this), true /* batch */, false /* prepend */);
            });
        IPython.notebook.save_notebook();
    };

    /**
     * Set dashboard to allow draggging/resizing/showing/hiding or enable static mode.
     * @param  {boolean} doEnable   if `false`, sets dashboard to static mode
     */
    Dashboard.prototype.setInteractive = function(doEnable) {
        this._loaded.then(function() {
            this.gridstack.set_static(!doEnable);
            if (doEnable) {
                this.gridstack.enable();
            } else {
                this.gridstack.disable();
            }
        }.bind(this));
    };

    /**
     * Delete dashboard resources
     */
    Dashboard.prototype.destroy = function() {
        this.gridstack.removeStylesheet();
        this.gridstack.destroy(false /* detach_node */);
        this.$container.removeData('gridstack'); // remove stored instance, so we can re-init

        $('.grid-stack-item')
                .resizable('destroy').draggable('destroy')
                .removeClass('ui-resizable-autoHide'); // jquery bug, cannot remove class using API

        $('.dashboard-item-background').remove();

        $('.grid-stack').removeClass('grid-stack');
        $('.grid-stack-item').removeClass('grid-stack-item');
        $('.grid-control-container').remove();
        this.$hiddenContainer.remove();
        $('#notebook-container').css('width', '').css('height', '');
        $('body').removeClass('urth-dashboard');
    };

    return {
        /**
         * Instantiate the Dashboard view.
         * @param  {DomNode|jQuery} opts.container  element on which to create Dashboard grid
         * @param  {number} opts.numCols            number of columns for the grid
         * @param  {number} opts.rowHeight          height (in px) of the grid rows
         * @param  {number} opts.gridMargin         size (in px) of margin between cells in grid
         * @param  {number} opts.defaultCellWidth   default width (in number of columns) of cells
         * @param  {number} opts.defaultCellHeight  default height (in number of rows) of cells
         * @param  {number} opts.minCellHeight      minimum height (in number of rows) that cell
         *                                          can occupy
         * @param  {Function} opts.exit             callback which is invoked when the Dashboard
         *                                          initiates exiting from Dashboard Mode (for
         *                                          example, if user clicks on cell edit button to
         *                                          go back to Notebook view)
         *
         * @return {Dashboard}      instance of Dashboard
         */
        create: function(opts) {
            return new Dashboard(opts);
        }
    };
});
