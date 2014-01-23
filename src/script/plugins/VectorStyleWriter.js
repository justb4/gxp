/**
 * Copyright (c) 2008-2011 The Open Planning Project
 *
 * Published under the GPL license.
 * See https://github.com/opengeo/gxp/raw/master/license.txt for the full text
 * of the license.
 */

/**
 * @requires util.js
 * @requires plugins/StyleWriter.js
 */

Ext.namespace("gxp.plugins");

/** api: (define)
 *  module = gxp.plugins
 *  class = VectorStyleWriter
 */

/** api: (extends)
 *  plugins/StyleWriter.js
 */

/** api: constructor
 *  .. class:: VectorStyleWriter(config)
 *
 *      Save styles from :class:`gxp.VectorStylesDialog` or similar classes that
 *      have a ``layerRecord`` and a ``stylesStore`` with a ``userStyle``
 *      field. The plugin provides a save method, which will save to the Feature-styles in the associated
 *      Vector Layer, thereby redrawing these Features.
 */
gxp.plugins.VectorStyleWriter = Ext.extend(gxp.plugins.StyleWriter, {

    /** private: method[constructor]
     */
    constructor: function (config) {
        this.initialConfig = config;
        Ext.apply(this, config);

        gxp.plugins.VectorStyleWriter.superclass.constructor.apply(this, arguments);
    },


    /** private: method[init]
     *  :arg target: ``Object`` The object initializing this plugin.
     */
    init: function (target) {
        gxp.plugins.VectorStyleWriter.superclass.init.apply(this, arguments);

        target.on({
            "beforesaved": this.write,
            "saved": this.assignStyles,
            scope: this
        });
    },

    /** api: method[write]
     *  :arg options: ``Object``
     *
     *  Saves the styles of the target's ``layerRecord`` using GeoServer's
     *  RESTconfig API.
     *
     *  Supported options:
     *
     *  * defaultStyle - ``String`` If set, the default style will be set.
     *  * success - ``Function`` A function to call when all styles were
     *    written successfully.
     *  * scope - ``Object`` A scope to call the ``success`` function with.
     */
    write: function (options) {
        var layerRecord = this.target.layerRecord;
        var layer = layerRecord.getLayer();
        if (layer.customStyling && layer.features && layer.styleMap && layer.styleMap.styles['default']) {
            var layerStyle = layer.styleMap.styles['default'];

            var features = layer.features, feature, featureStyle;
            for (var f = 0; f < features.length; f++) {
                feature = features[f];
                if (feature.style) {
                    continue;
                }
                featureStyle = layerStyle;
                if (feature.renderIntent && feature.renderIntent != 'default') {
                    featureStyle = layer.styleMap.styles[feature.renderIntent ];
                }
                // Some features still may not yet have local style object
                // assign now from Layer Style before Style permanently changes
                feature.style = featureStyle.createSymbolizer(feature);
            }
        }

        this.target.stylesStore.commitChanges();
        this.target.fireEvent("saved", this.target, this.target.selectedStyle.get("name"));
    },

    /** private: method[writeStyle]
     *  :arg styleRec: ``Ext.data.Record`` the record from the target's
     *      ``stylesStore`` to write
     *  :arg dispatchQueue: ``Array(Function)`` the dispatch queue the write
     *      function is added to.
     *
     *  This method does not actually write styles, it just adds a function to
     *  the provided ``dispatchQueue`` that will do so.
     */
    writeStyle: function (styleRec, dispatchQueue) {
        var styleName = styleRec.get("userStyle").name;
    },

    /** private: method[assignStyles]
     * Assigns Style's symbology from (Vector) Layer to Features in Layer.
     *  :arg defaultStyle: ``String`` The default style. Optional.
     *  :arg callback: ``Function`` The function to call when all operations
     *      succeeded. Will be called in the scope of this instance. Optional.
     */
    assignStyles: function (target, styleName) {
        if (!this.target.first) {
            return;
        }
        var layerRecord = this.target.layerRecord;
        var layer = layerRecord.getLayer();
        var layerStyles = layer.styleMap;
        var styleRec = this.target.selectedStyle;
        if (styleRec) {
            // var oldStyleName = styleRec.get("userStyle").name;
            var oldStyle = styleRec.get("userStyle");
            var newStyle = oldStyle.clone();
            newStyle.defaultsPerSymbolizer = false;

            // GXP Style Editing needs symbolizers array in Rule object
            // while Vector/Style drawing needs symbolizer hash...
            var textStyle = {};
            var symbolizer;
            if (newStyle.rules) {
                for (var i = 0, len = newStyle.rules.length; i < len; i++) {
                    var rule = newStyle.rules[i];
                    rule.symbolizer = {};

                    for (var j = 0; j < rule.symbolizers.length; j++) {
                        symbolizer = rule.symbolizers[j];
                        var symbolType = symbolizer.CLASS_NAME.split(".").pop();
                        if (symbolType == 'Text') {
                            textStyle.label = symbolizer.label;
                            textStyle.fontFamily = symbolizer.fontFamily;
                            textStyle.fontSize = symbolizer.fontSize;
                            textStyle.fontWeight = symbolizer.fontWeight;
                            textStyle.fontStyle = symbolizer.fontStyle;
                            textStyle.fontColor = symbolizer.fontColor;
                        }
                        rule.symbolizer[symbolType] = rule.symbolizers[j].clone();
                        // newStyle.label = rule.symbolizer[symbolType].label;
                    }
                    rule.symbolizers = undefined;
                }
            }
            OpenLayers.Util.extend(newStyle.defaultStyle, textStyle);

            newStyle.propertyStyles = newStyle.findPropertyStyles();
            layerStyles.styles[styleName] = newStyle;
            // newStyle.defaultStyle = undefined;
            var feature;
//            if (layer.customStyling === true && (!layer.selectedFeatures || layer.selectedFeatures.length == 0)) {
//                return;
//            }
            // Assign Style to all or, if features selected, to individual Layer features
            var features = (layer.selectedFeatures && layer.selectedFeatures.length > 0) ? layer.selectedFeatures : layer.features;
            layer.eraseFeatures(features);
            for (var f = 0; f < features.length; f++) {
                feature = features[f];

                var changeFeatureStyle = !layer.customStyling || (layer.customStyling && ((layer.selectedFeatures && layer.selectedFeatures.length > 0) || !feature.style) && !(feature.renderIntent && feature.renderIntent != 'default'));
                if (changeFeatureStyle) {
                    // Some features still may have local style object
                    if (feature.style) {
                        delete feature.style;
                    }
                    feature.style = newStyle.createSymbolizer(feature);
                }

                layer.drawFeature(feature);
            }

            // layerRecord.store.fireEvent("update", layerRecord.store, layerRecord, Ext.data.Record.EDIT)
        }
    },

    /** private: method[deleteStyles]
     *  Deletes styles that are no longer assigned to the layer.
     */
    deleteStyles: function () {
//        for (var i=0, len=this.deletedStyles.length; i<len; ++i) {
//            Ext.Ajax.request({
//                method: "DELETE",
//                url: this.baseUrl + "/styles/" + this.deletedStyles[i] +
//                    // cannot use params for DELETE requests without jsonData
//                    "?purge=true"
//            });
//        }
        this.deletedStyles = [];
    }

});

/** api: ptype = gxp_vectorstylewriter */
Ext.preg("gxp_vectorstylewriter", gxp.plugins.VectorStyleWriter);