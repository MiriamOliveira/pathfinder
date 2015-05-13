define(['jquery', 'd3', '../listeners', '../sorting', '../setinfo', '../selectionutil', './pathsorting', '../pathutil', '../query/pathquery', '../datastore', '../config', '../listoverlay', '../query/queryview', '../query/queryUtil', '../hierarchyelements'],
  function ($, d3, listeners, sorting, setInfo, selectionUtil, pathSorting, pathUtil, pathQuery, dataStore, config, ListOverlay, queryView, queryUtil, hierarchyElements) {
    'use strict';

    //var jsonPaths = require('./testpaths1.json');


    var NODE_START = 90;
    var BOX_WIDTH = 16;
    var SET_TYPE_INDENT = 10;
    var NODE_WIDTH = 50;
    var NODE_HEIGHT = 20;
    var V_SPACING = 5;
    var PATH_HEIGHT = NODE_HEIGHT + 2 * V_SPACING;
    var EDGE_SIZE = 50;
    var SET_HEIGHT = 10;
    var SET_TYPE_HEIGHT = 14;
    var PATH_SPACING = 15;
    var DATASET_HEIGHT = 14;
    var DATA_GROUP_HEIGHT = 80;
    var DATA_GROUP_V_PADDING = 5;
    var DATA_GROUP_CONTENT_HEIGHT = DATA_GROUP_HEIGHT - 2 * DATA_GROUP_V_PADDING;


    var alignPathNodes = false;
    var currentSetTypeId = 0;

    var sortingManager = pathSorting.sortingManager;
    var sortingStrategies = pathSorting.sortingStrategies;


    var pathListUpdateTypes = {
      ALIGN_PATH_NODES: "ALIGN_PATH_NODES",
      UPDATE_NODE_SET_VISIBILITY: "UPDATE_SET_VISIBILITY",
      COLLAPSE_ELEMENT_TYPE: "COLLAPSE_SETYPE"
    };

    var showNodeSets = false;

    function SetRep(setId, type) {
      this.id = setId;
      this.nodeIndices = [];
      this.relIndices = [];
      this.setType = type;
    }

    SetRep.prototype = {
      getHeight: function () {
        return SET_HEIGHT;
      },

      //Defines whether this set can be shown. Only considers own data to determine that, not e.g. whether its set type is collapsed.
      canBeShown: function () {
        return showNodeSets || (!showNodeSets && this.relIndices.length > 0);
      }
    };

    function SetType(type) {
      this.id = currentSetTypeId++;
      this.type = type;
      this.sets = [];
      this.setDict = {};
      this.collapsed = true;
      this.nodeIndices = [];
      this.relIndices = [];
    }

    SetType.prototype = {
      getHeight: function () {
        var height = SET_TYPE_HEIGHT;
        if (!this.collapsed) {
          this.sets.forEach(function (setRep) {
            if (setRep.canBeShown()) {
              height += setRep.getHeight();
            }
          });
        }
        return height;
      },

      canBeShown: function () {
        return showNodeSets || (!showNodeSets && this.relIndices.length > 0);
      }
    };

    function DatasetWrapper(name, minValue, maxValue) {
      hierarchyElements.HierarchyElement.call(this);
      this.collapsed = true;
      this.name = name;
      this.minValue = minValue;
      this.maxValue = maxValue;
    }

    DatasetWrapper.prototype = Object.create(hierarchyElements.HierarchyElement.prototype);

    DatasetWrapper.prototype.getBaseHeight = function () {
      return DATASET_HEIGHT;
    };

    function DataGroupWrapper(name, parent) {
      hierarchyElements.HierarchyElement.call(this, parent);
      this.name = name;
    }

    DataGroupWrapper.prototype = Object.create(hierarchyElements.HierarchyElement.prototype);

    DataGroupWrapper.prototype.getBaseHeight = function () {
      return DATA_GROUP_HEIGHT;
    };


    function PathWrapper(path) {
      this.path = path;
      this.nodePositions = d3.range(0, path.nodes.length - 1);
      this.rank = "?.";
      this.addPathSets(path);
      this.addDatasets();
    }

    PathWrapper.prototype = {

      getHeight: function () {
        var height = PATH_HEIGHT;
        height += this.getSetHeight();
        height += this.getDatasetHeight();
        return height;
      },

      getSetHeight: function () {
        var height = 0;
        this.setTypes.forEach(function (setType) {
          if (setType.canBeShown()) {
            height += setType.getHeight();
          }
        });
        return height;
      },

      getDatasetHeight: function () {
        var height = 0;
        this.datasets.forEach(function (dataset) {
          if (dataset.canBeShown()) {
            height += dataset.getHeight();
          }
        });
        return height;
      },

      getWidth: function () {
        return NODE_START + this.path.nodes.length * NODE_WIDTH + this.path.edges.length * EDGE_SIZE;
      },

      addDatasets: function () {
        var datasets = dataStore.getDataSets();
        var that = this;
        this.datasets = [];

        datasets.forEach(function (dataset) {
          var d = new DatasetWrapper(dataset.name, dataset.minValue, dataset.maxValue);
          that.datasets.push(d);

          dataset.groups.forEach(function (group) {
            var g = new DataGroupWrapper(group, d);
            d.children.push(g);
          });
        });


      },

      addPathSets: function (path) {

        var setTypeDict = {};
        var setTypeList = [];

        for (var i = 0; i < path.nodes.length; i++) {
          var node = path.nodes[i];

          pathUtil.forEachNodeSet(node, function (setType, setId) {
            addSetForNode(setType, setId, i);
          });
        }
        ;

        for (var i = 0; i < path.edges.length; i++) {
          var edge = path.edges[i];

          pathUtil.forEachEdgeSet(edge, function (setType, setId) {
            addSetForEdge(setType, setId, i);
          });
        }

        function addSetForNode(type, setId, nodeIndex) {
          var currentSet = addSet(type, setId);
          currentSet.nodeIndices.push(nodeIndex);
          var currentSetType = setTypeDict[type];
          if (currentSetType.nodeIndices.indexOf(nodeIndex) === -1) {
            currentSetType.nodeIndices.push(nodeIndex);
          }
        }

        function addSetForEdge(type, setId, relIndex) {
          var currentSet = addSet(type, setId);
          currentSet.relIndices.push(relIndex);
          var currentSetType = setTypeDict[type];
          if (currentSetType.relIndices.indexOf(relIndex) === -1) {
            currentSetType.relIndices.push(relIndex);
          }
        }

        function addSet(type, setId) {
          var setType = setTypeDict[type];

          if (typeof setType === "undefined") {
            setType = new SetType(type);
            //setType = {type: type, sets: [], setDict: {}, collapsed: false, nodeIndices: [], relIndices: []};
            setTypeDict[type] = setType;
            setTypeList.push(setType);
          }

          var mySet = setType.setDict[setId];
          if (typeof mySet === "undefined") {
            mySet = new SetRep(setId, type);
            //mySet = {id: setId, nodeIndices: [], relIndices: [], setType: type};
            setType.setDict[setId] = mySet;
            setType.sets.push(mySet);
          }
          return mySet;
        }

        //setTypeList.forEach(function (setType) {
        //  delete setType.setDict;
        //});

        this.setTypes = setTypeList;
      }
    };

    function CrossPathNodeConnection(id, nodeId) {
      this.id = id;
      this.nodeId = nodeId;
      this.nodeAnchors = [];
      this.nodeLocations = [];
      this.maxNodeIndex = -1;
    }

    CrossPathNodeConnection.prototype = {

      addNodeAnchor: function (pathIndex, nodeIndex) {

        if (this.maxNodeIndex < nodeIndex) {
          this.maxNodeIndex = nodeIndex;
        }

        this.nodeLocations.push({pathIndex: pathIndex, nodeIndex: nodeIndex});

        if (this.nodeAnchors.length > 0) {
          this.nodeAnchors[this.nodeAnchors.length - 1].last = false;
          this.nodeAnchors.push({pathIndex: pathIndex, nodeIndex: nodeIndex, top: true, last: false, first: false});
          this.nodeAnchors.push({pathIndex: pathIndex, nodeIndex: nodeIndex, top: false, last: true, first: false});
        } else {
          this.nodeAnchors.push({pathIndex: pathIndex, nodeIndex: nodeIndex, top: true, last: false, first: true});
          this.nodeAnchors.push({pathIndex: pathIndex, nodeIndex: nodeIndex, top: false, last: true, first: false});
        }
      }

    };

    function getNodeSetCount(node, setTypeWrapper) {
      var numSets = 0;

      pathUtil.forEachNodeSetOfType(node, setTypeWrapper.type, function (type, setId) {
        if (setTypeWrapper.setDict[setId].canBeShown()) {
          numSets++;
        }
      });
      return numSets;
    }

    function getEdgeSetCount(edge, setTypeWrapper) {
      var numSets = 0;

      pathUtil.forEachEdgeSetOfType(edge, setTypeWrapper.type, function (type, setId) {
        if (setTypeWrapper.setDict[setId].canBeShown()) {
          numSets++;
        }
      });
      return numSets;
    }


//var allPaths = [];

    function getPathContainerTranslateY(pathWrappers, pathIndex) {
      var posY = 0;
      for (var index = 0; index < pathIndex; index++) {
        posY += pathWrappers[index].getHeight() + PATH_SPACING;
      }
      return posY;
    }

    function getPathContainerTransformFunction(pathWrappers) {
      return function (d, i) {
        return "translate(0," + getPathContainerTranslateY(pathWrappers, i) + ")";
      };
    }

    function getSetTypeTransformFunction(pathWrappers) {

      return function (d, i) {
        var pathWrapper = pathWrappers[d.pathIndex];

        var posY = PATH_HEIGHT;
        for (var typeIndex = 0; typeIndex < i; typeIndex++) {
          var setType = pathWrapper.setTypes[typeIndex];
          if (setType.canBeShown()) {
            posY += setType.getHeight();
          }
        }

        return "translate(0," + posY + ")";
      }
    }

    function getSetTransformFunction(pathWrappers) {
      return function (d, i) {
        var setType = pathWrappers[d.pathIndex].setTypes[d.setTypeIndex];

        var posY = SET_TYPE_HEIGHT;
        var filteredSets = setType.sets.filter(function (s) {
          return s.canBeShown();
        });
        for (var setIndex = 0; setIndex < i; setIndex++) {
          var set = filteredSets[setIndex];
          //if (set.canBeShown()) {
          posY += set.getHeight();
          //}
        }
        return "translate(0," + posY + ")";
      }

    }


    function updateSets(setInfo) {

      var svg = d3.select("#pathlist svg");

      svg.selectAll("g.pathContainer g.setGroup g.set text")
        .text(function (d) {
          return setInfo.getSetLabel(d.set.id);
        });

      svg.selectAll("g.pathContainer g.setGroup g.set title")
        .text(function (d) {
          return setInfo.getSetLabel(d.set.id);
        });
    }


    function getPathKey(d) {
      return d.path.id;
    }


    function isSourceNodeLeft(nodes, edge, edgeIndex) {
      return nodes[edgeIndex].id === edge.sourceNodeId;
    }


    function PathList(listView) {
      this.listView = listView;
      this.paths = [];
      this.pathWrappers = [];
      this.updateListeners = [];
      this.setSelectionListener = 0;
      this.connectionSelectionListener = 0;
      this.stubSelectionListener = 0;
      this.selectionListeners = [];
      this.crossConnections = [];
      this.connectionStubs = [];
      this.maxNumNodeSets = 0;
      this.maxNumEdgeSets = 0;
      this.pivotNodeId = -1;
      this.pivotNodeIndex = 0;
      var that = this;

      this.alignPathNodesUpdateListener = function (align) {
        alignPathNodes = align;

        that.renderPaths();
      };

      this.setVisibilityUpdateListener = function (showSets) {
        showNodeSets = showSets;

        if (typeof that.parent === "undefined") {
          return;
        }

        that.updateMaxSets();
        that.updatePathList();
      };

      this.listUpdateListener = function (updatedObject) {
        if (typeof that.parent === "undefined") {
          return;
        }

        that.updatePathList();
      };

      this.removeFilterChangedListener = function (remove) {
        if (typeof that.parent === "undefined") {
          return;
        }

        if (remove) {
          that.updatePathWrappersToFilter();
        } else {
          that.addAllPaths();
        }
        that.notifyUpdateListeners();
      };

      this.queryChangedListener = function (query) {
        if (typeof that.parent === "undefined") {
          return;
        }

        if (pathQuery.isRemoveFilteredPaths() || pathQuery.isRemoteQuery()) {
          that.updatePathWrappersToFilter();
          that.notifyUpdateListeners();
        } else {
          that.updatePathList();
        }
      };

      this.sortUpdateListener = function (comparator) {
        //sortingManager.sort(that.pathWrappers, that.parent, "g.pathContainer", getPathContainerTransformFunction(that.pathWrappers), sortStrategyChain);

        if (typeof that.parent === "undefined") {
          return;
        }

        //that.sortPaths(comparator);

        that.renderPaths();
      };

      this.collapseElementListener = function (collapseElement) {
        if (typeof that.parent === "undefined") {
          return;
        }

        that.pathWrappers.forEach(function (pathWrapper) {
          pathWrapper.setTypes.forEach(function (t) {
            if (t.type === collapseElement.type) {
              t.collapsed = collapseElement.collapsed;
            }
          });

          pathWrapper.datasets.forEach(function (d) {
            if (d.name === collapseElement.type) {
              d.collapsed = collapseElement.collapsed;
            }
          })
        });
        that.updatePathList();
      }
    }

    PathList.prototype = {

      sortPaths: function (comparator) {
        var that = this;

        that.pathWrappers.sort(comparator);

        var rankingStrategyChain = Object.create(pathSorting.sortingManager.currentStrategyChain);
        rankingStrategyChain.splice(rankingStrategyChain.length - 1, 1);

        var rankComparator = sorting.getComparatorFromStrategyChain(rankingStrategyChain);

        var currentRank = 0;
        var rankCounter = 0;
        var prevWrapper = 0;
        that.pathWrappers.forEach(function (pathWrapper) {
          rankCounter++;
          if (prevWrapper === 0) {
            currentRank = rankCounter;
          } else {
            if (rankComparator(prevWrapper, pathWrapper) !== 0) {
              currentRank = rankCounter;
            }
          }
          pathWrapper.rank = currentRank.toString() + ".";
          prevWrapper = pathWrapper;
          //} else {
          //}

        });

      },

      addUpdateListener: function (l) {
        this.updateListeners.push(l);
      },

      notifyUpdateListeners: function () {
        var that = this;
        this.updateListeners.forEach(function (l) {
          l(that);
        })
      }
      ,
      init: function () {
        NODE_WIDTH = config.getNodeWidth();
        NODE_HEIGHT = config.getNodeHeight();
        EDGE_SIZE = config.getEdgeSize();
        listeners.add(updateSets, listeners.updateType.SET_INFO_UPDATE);
        listeners.add(this.collapseElementListener, pathListUpdateTypes.COLLAPSE_ELEMENT_TYPE);
        listeners.add(this.setVisibilityUpdateListener, pathListUpdateTypes.UPDATE_NODE_SET_VISIBILITY);
        listeners.add(this.alignPathNodesUpdateListener, pathListUpdateTypes.ALIGN_PATH_NODES);
        listeners.add(this.queryChangedListener, listeners.updateType.QUERY_UPDATE);
        listeners.add(this.removeFilterChangedListener, listeners.updateType.REMOVE_FILTERED_PATHS_UPDATE);
        listeners.add(this.sortUpdateListener, pathSorting.updateType);
      },

      updatePathWrappersToFilter: function () {
        var pathWrappersToRemove = [];

        var that = this;

        if (pathQuery.isRemoteQuery()) {
          for (var i = 0; i < this.paths.length; i++) {
            var path = this.paths[i];
            if (pathQuery.isPathFiltered(path.id)) {
              this.paths.splice(i, 1);
              i--;
            }
          }
        }

        this.pathWrappers.forEach(function (pathWrapper) {
          if (pathQuery.isPathFiltered(pathWrapper.path.id)) {
            pathWrappersToRemove.push(pathWrapper);
          }
        });

        pathWrappersToRemove.forEach(function (pathWrapper) {
          var index = that.pathWrappers.indexOf(pathWrapper);
          if (index !== -1) {
            that.pathWrappers.splice(index, 1);
          }
        });

        var pathsToAdd = [];
        var that = this;

        this.paths.forEach(function (path) {
          if (!pathQuery.isPathFiltered(path.id)) {
            var pathPresent = false;
            for (var i = 0; i < that.pathWrappers.length; i++) {
              var pathWrapper = that.pathWrappers[i];
              if (pathWrapper.path.id === path.id) {
                pathPresent = true;
              }
            }

            if (!pathPresent) {
              pathsToAdd.push(path);
            }
          }
        });

        pathsToAdd.forEach(function (path) {
          that.pathWrappers.push(new PathWrapper(path));
        });

        this.updateMaxSets();

        this.renderPaths();
      },

      getNodeSetScale: function () {
        return d3.scale.linear().domain([1, this.maxNumNodeSets]).range([2, 7]);
      },

      getEdgeSetScale: function () {
        return d3.scale.linear().domain([1, this.maxNumEdgeSets]).range([1, 6]);
      },

      updateMaxSets: function () {
        this.maxNumEdgeSets = 0;
        this.maxNumNodeSets = 0;

        var that = this;
        this.pathWrappers.forEach(function (pathWrapper) {
          that.updateMaxSetsForPathWrapper(pathWrapper);
        });
      },

      addAllPaths: function () {
        var pathsToAdd = [];
        var that = this;

        this.paths.forEach(function (path) {
          var pathPresent = false;
          for (var i = 0; i < that.pathWrappers.length; i++) {
            var pathWrapper = that.pathWrappers[i];
            if (pathWrapper.path.id === path.id) {
              pathPresent = true;
            }
          }

          if (!pathPresent) {
            pathsToAdd.push(path);
          }

        });

        pathsToAdd.forEach(function (path) {
          that.addPathAsPathWrapper(path);
        });

        this.renderPaths();
      },

      updatePathList: function () {


        this.updateDataBinding();


        var that = this;

        var nodeSetScale = this.getNodeSetScale();
        var edgeSetScale = this.getEdgeSetScale();

        var pathContainers = that.parent.selectAll("g.pathContainer").data(that.pathWrappers, getPathKey)
          .transition()
          .attr("transform", getPathContainerTransformFunction(this.pathWrappers))
          .style("opacity", function (d) {
            if (pathQuery.isPathFiltered(d.path.id)) {
              return 0.5;
            }
            return 1;
          });
        //that.parent.selectAll("g.pathContainer g.path g.edgeGroup").data(that.pathWrappers)
        //  .transition()
        //  .attr("transform", function (d) {
        //    return that.getPivotNodeAlignedTransform(d)
        //  });
        //that.parent.selectAll("g.pathContainer g.path g.nodeGroup").data(that.pathWrappers)
        //  .transition()
        //  .attr("transform", function (d) {
        //    return that.getPivotNodeAlignedTransform(d)
        //  });


        var allSetTypes = that.parent.selectAll("g.pathContainer g.setGroup g.setType");


        that.renderSets(allSetTypes);
        that.renderDatasets();

        pathContainers
          .each(function () {

            var setTypes = d3.select(this).selectAll("g.setType");

            setTypes.each(function (d) {
              //d3.select(this).selectAll("g.setTypeSummary")
              //  .transition()
              //  .attr("transform", function (d) {
              //    return that.getPivotNodeAlignedTransform(that.pathWrappers[d.pathIndex]);
              //  });

              var setTypeSummaryContainer = d3.select(this).selectAll("g.setTypeSummary");

              setTypeSummaryContainer.each(function (d, i) {
                d3.select(this).selectAll("circle")
                  .transition()
                  .attr({
                    cx: function (d, i) {
                      var pivotNodeTranslate = that.getPivotNodeAlignedTranslationX(that.pathWrappers[d.pathIndex]);
                      var position = that.pathWrappers[d.pathIndex].nodePositions[d.nodeIndex];
                      return pivotNodeTranslate + position * (NODE_WIDTH + EDGE_SIZE) + NODE_WIDTH / 2;
                    },

                    r: function (d) {

                      var numSets = getNodeSetCount(that.pathWrappers[d.pathIndex].path.nodes[d.nodeIndex],
                        that.pathWrappers[d.pathIndex].setTypes[d.setTypeIndex]);

                      return nodeSetScale(numSets);
                    }

                  });

                d3.select(this).selectAll("line")
                  .transition()
                  .attr({

                    x1: function (d) {
                      var pivotNodeTranslate = that.getPivotNodeAlignedTranslationX(that.pathWrappers[d.pathIndex]);
                      var position = that.pathWrappers[d.pathIndex].nodePositions[d.relIndex];
                      return pivotNodeTranslate + position * (NODE_WIDTH + EDGE_SIZE) + NODE_WIDTH / 2;
                    },

                    x2: function (d) {
                      var pivotNodeTranslate = that.getPivotNodeAlignedTranslationX(that.pathWrappers[d.pathIndex]);
                      var position = that.pathWrappers[d.pathIndex].nodePositions[d.relIndex + 1];
                      return pivotNodeTranslate + position * (NODE_WIDTH + EDGE_SIZE) + NODE_WIDTH / 2;
                    },

                    "stroke-width": function (d) {
                      var numSets = getEdgeSetCount(that.pathWrappers[d.pathIndex].path.edges[d.relIndex],
                        that.pathWrappers[d.pathIndex].setTypes[d.setTypeIndex]);
                      return edgeSetScale(numSets);
                    }
                  });
              });

            });


            setTypes
              .transition()
              .each("start", function (d) {
                var setTypeSummaryContainer = d3.select(this).selectAll("g.setTypeSummary");
                //.attr("transform", function (d) {
                //  return that.getPivotNodeAlignedTransform(that.pathWrappers[d.pathIndex]);
                //});

                if (d.setType.collapsed) {
                  setTypeSummaryContainer
                    .attr("display", "inline");

                }

                d3.select(this).selectAll("text.collapseIconSmall")
                  .text(function (d) {
                    return d.setType.collapsed ? "\uf0da" : "\uf0dd";
                  });


                if (!d.setType.canBeShown()) {
                  d3.select(this)
                    .attr("display", "none");
                }
              })
              .attr("transform", getSetTypeTransformFunction(that.pathWrappers))
              .each("end", function (d) {

                if (!d.setType.collapsed) {
                  d3.select(this).selectAll("g.setTypeSummary")
                    .attr("display", "none");
                }

                if (d.setType.canBeShown()) {
                  d3.select(this)
                    .attr("display", "inline");
                }
              });


          });

        this.renderCrossConnections();

        this.notifyUpdateListeners();
      },

      destroy: function () {
        this.removePaths();
        this.updateListeners = [];
        listeners.remove(this.collapseElementListener, pathListUpdateTypes.COLLAPSE_ELEMENT_TYPE);
        listeners.remove(this.setVisibilityUpdateListener, pathListUpdateTypes.UPDATE_NODE_SET_VISIBILITY);
        listeners.remove(this.alignPathNodesUpdateListener, pathListUpdateTypes.ALIGN_PATH_NODES);
        listeners.remove(this.queryChangedListener, listeners.updateType.QUERY_UPDATE);
        listeners.remove(this.removeFilterChangedListener, listeners.updateType.REMOVE_FILTERED_PATHS_UPDATE);
        listeners.remove(updateSets, listeners.updateType.SET_INFO_UPDATE);
        listeners.remove(this.sortUpdateListener, pathSorting.updateType);
      },

      removeGuiElements: function () {

        selectionUtil.removeListeners(this.selectionListeners);
        this.selectionListeners = [];
        selectionUtil.removeListeners(this.setSelectionListener);
        this.setSelectionListener = 0;
        selectionUtil.removeListeners(this.connectionSelectionListener);
        this.connectionSelectionListener = 0;
        selectionUtil.removeListeners(this.stubSelectionListener);
        this.stubSelectionListener = 0;
        currentSetTypeId = 0;

        if (typeof this.parent === "undefined")
          return;

        this.parent.selectAll("g.crossConnectionContainer")
          .remove();

        this.parent.selectAll("g.pathContainer")
          .remove();

        //parent.select("#arrowRight").remove();
        //parent.select("#SetLabelClipPath").remove();


      },

      removePaths: function () {
        this.removeGuiElements(this.parent);
        this.paths = [];
        this.pathWrappers = [];
        this.maxNumEdgeSets = 0;
        this.maxNumNodeSets = 0;
        this.crossConnections = [];
        this.connectionStubs = [];
      },


      render: function (parent) {
        if (typeof this.parent === "undefined") {
          this.parent = parent;
          this.parent.append("g")
            .classed("crossConnectionContainer", true);
        }


        if (this.pathWrappers.length > 0) {

          this.renderPaths();
        }
      },

      setPaths: function (paths) {
        var that = this;
        this.pathWrappers = [];
        this.paths = paths;
        paths.forEach(function (path) {
          that.addPathAsPathWrapper(path);
        })
      },

      updateMaxSetsForPathWrapper: function (pathWrapper) {
        var that = this;

        pathWrapper.setTypes.forEach(function (setTypeWrapper) {
          pathWrapper.path.nodes.forEach(function (node) {
            var numNodeSets = getNodeSetCount(node, setTypeWrapper);
            if (numNodeSets > that.maxNumNodeSets) {
              that.maxNumNodeSets = numNodeSets;
            }
          });

          pathWrapper.path.edges.forEach(function (edge) {
            var numEdgeSets = getEdgeSetCount(edge, setTypeWrapper);
            if (numEdgeSets > that.maxNumEdgeSets) {
              that.maxNumEdgeSets = numEdgeSets;
            }
          });
        });
      },

      addPathAsPathWrapper: function (path) {
        if (!(pathQuery.isPathFiltered(path.id) && pathQuery.isRemoveFilteredPaths())) {
          var pathWrapper = new PathWrapper(path);
          this.pathWrappers.push(pathWrapper);
          this.updateMaxSetsForPathWrapper(pathWrapper);
        }

      },

      addPath: function (path) {
        this.paths.push(path);
        this.addPathAsPathWrapper(path);
      },

      getSize: function () {
        var totalHeight = 0;
        var currentMaxWidth = 0;

        this.pathWrappers.forEach(function (pathWrapper) {
          totalHeight += pathWrapper.getHeight() + PATH_SPACING;
          var currentWidth = pathWrapper.getWidth();
          if (currentWidth > currentMaxWidth) {
            currentMaxWidth = currentWidth;
          }
        });
        return {width: currentMaxWidth, height: totalHeight};
      }
      ,

      updateDataBinding: function () {
        if (typeof this.parent === "undefined") {
          return;
        }
        var that = this;

        var pathContainers = this.parent.selectAll("g.pathContainer")
          .data(this.pathWrappers, getPathKey);
        this.parent.selectAll("g.pathContainer g.pathContent")
          .data(this.pathWrappers, getPathKey);

        pathContainers.each(function (pathWrapper, i) {

          d3.select(this).selectAll("g.path").selectAll("g.nodeGroup").selectAll("g.node")
            .data(function () {
              return pathWrapper.path.nodes.map(function (node) {
                return {node: node, pathIndex: i};
              });
            });
          d3.select(this).selectAll("g.path").selectAll("g.nodeGroup").selectAll("g.nodeCont")
            .data(function () {
              return pathWrapper.path.nodes.map(function (node) {
                return {node: node, pathIndex: i};
              });
            });

          d3.select(this).selectAll("g.path").selectAll("g.edgeGroup").selectAll("g.edge")
            .data(function () {
              return pathWrapper.path.edges.map(function (edge) {
                return {edge: edge, pathIndex: i};
              });
            });

          var setTypes = d3.select(this).selectAll("g.setGroup").selectAll("g.setType")
            .data(function () {
              return pathWrapper.setTypes.map(function (mySetType) {
                return {setType: mySetType, pathIndex: i};
              });
            });

          d3.select(this).selectAll("g.setGroup").selectAll("g.setTypeSummary")
            .data(function () {
              return pathWrapper.setTypes.map(function (mySetType) {
                return {setType: mySetType, pathIndex: i};
              });
            });

          setTypes.each(function (d, i) {

            d3.select(this).selectAll("g.setTypeSummary").each(function () {
              d3.select(this).selectAll("circle")
                .data(function () {
                  return d.setType.nodeIndices.map(function (index) {
                    return {pathIndex: d.pathIndex, setTypeIndex: i, nodeIndex: index};
                  });
                });

              d3.select(this).selectAll("line")
                .data(function () {
                  return d.setType.relIndices.map(function (index) {
                    return {pathIndex: d.pathIndex, setTypeIndex: i, relIndex: index};
                  });
                })
            });

            var set = d3.select(this)
              .selectAll("g.setCont")
              .data(function () {
                var filteredSets = d.setType.sets.filter(function (s) {
                  return s.canBeShown();
                });

                return filteredSets.map(function (myset) {
                  return {
                    set: myset,
                    pathIndex: d.pathIndex,
                    setTypeIndex: that.pathWrappers[d.pathIndex].setTypes.indexOf(d.setType)
                  };
                });
              }, function (d) {
                return d.set.id;
              });

            var setVisContainer = d3.select(this)
              .selectAll("g.setVisContainer")
              .data(function () {
                var filteredSets = d.setType.sets.filter(function (s) {
                  return s.canBeShown();
                });

                return filteredSets.map(function (myset) {
                  return {
                    set: myset,
                    pathIndex: d.pathIndex,
                    setTypeIndex: that.pathWrappers[d.pathIndex].setTypes.indexOf(d.setType)
                  };
                });
              }, function (d) {
                return d.set.id;
              });

            setVisContainer.each(function (d, i) {
              d3.select(this).selectAll("circle")
                .data(function () {
                  return d.set.nodeIndices.map(function (index) {
                    return {pathIndex: d.pathIndex, setTypeIndex: d.setTypeIndex, nodeIndex: index};
                  });
                });


              d3.select(this).selectAll("line").
                data(function (d, i) {
                  return d.set.relIndices.map(function (index) {
                    return {pathIndex: d.pathIndex, setTypeIndex: d.setTypeIndex, relIndex: index};
                  });
                });
            });


          });

        });
      },

      setPivotNode: function (id) {
        var maxNodeIndex = 0;
        this.pathWrappers.forEach(function (pathWrapper) {
          for (var i = pathWrapper.path.nodes.length - 1; i >= 0; i--) {
            if (pathWrapper.path.nodes[i].id === id && i > maxNodeIndex) {
              maxNodeIndex = i;
              break;
            }
          }
        });

        this.pivotNodeId = id;
        this.pivotNodeIndex = maxNodeIndex;

        this.updatePathList();
      },

      getPivotNodeAlignedTranslationX: function (pathWrapper) {

        if (alignPathNodes) {
          return NODE_START;
        }

        var index = -1;
        for (var i = 0; i < pathWrapper.path.nodes.length; i++) {
          if (pathWrapper.path.nodes[i].id === this.pivotNodeId) {
            index = i;
            break;
          }
        }

        if (index === -1) {
          return NODE_START;
        }

        return NODE_START + (this.pivotNodeIndex - index) * (NODE_WIDTH + EDGE_SIZE);
      },

      getPivotNodeAlignedTransform: function (pathWrapper) {

        return "translate(" + this.getPivotNodeAlignedTranslationX(pathWrapper) + ", 0)";

      },

      calcCrossConnections: function () {
        var that = this;
        this.crossConnections = [];
        this.connectionStubs = [];
        var connectionId = 0;
        var stubId = 0;
        var stubCandidates = {};
        var lastStubs = {};
        var previousNodeIndices = {};
        var currentNodeIndices = {};
        var previousConnections = {};
        var currentConnections = {};

        this.pathWrappers.forEach(function (pathWrapper, i) {

          currentConnections = {};
          currentNodeIndices = {};

          pathWrapper.path.nodes.forEach(function (node, j) {
            var connection = previousConnections[node.id.toString()];
            if (typeof connection !== "undefined") {
              connection.addNodeAnchor(i, j);
              currentConnections[node.id.toString()] = connection;
            } else {

              var previousNodeIndex = previousNodeIndices[node.id.toString()];
              if (typeof previousNodeIndex !== "undefined") {
                connection = new CrossPathNodeConnection(connectionId++, node.id);
                connection.addNodeAnchor(i - 1, previousNodeIndex);
                connection.addNodeAnchor(i, j);
                that.crossConnections.push(connection);
                delete lastStubs[node.id.toString()];
                currentConnections[node.id.toString()] = connection;
              } else {
                currentNodeIndices[node.id.toString()] = j;

                var prevStub = lastStubs[node.id.toString()];

                if (typeof prevStub !== "undefined" && (i - prevStub.pathIndex) > 1) {
                  prevStub.down = true;
                  var currentStub = {
                    id: stubId++,
                    nodeId: node.id,
                    pathIndex: i,
                    nodeIndex: j,
                    up: true,
                    down: false
                  };
                  that.connectionStubs.push(currentStub);
                  lastStubs[node.id.toString()] = currentStub;
                } else {

                  var prevStubCandidate = stubCandidates[node.id.toString()];

                  if (typeof prevStubCandidate !== "undefined" && (i - prevStubCandidate.pathIndex) > 1) {
                    var prevStub = {
                      id: stubId++,
                      nodeId: node.id,
                      pathIndex: prevStubCandidate.pathIndex,
                      nodeIndex: prevStubCandidate.nodeIndex,
                      up: false,
                      down: true
                    };
                    that.connectionStubs.push(prevStub);
                    var currentStub = {
                      id: stubId++,
                      nodeId: node.id,
                      pathIndex: i,
                      nodeIndex: j,
                      up: true,
                      down: false
                    };
                    that.connectionStubs.push(currentStub);
                    lastStubs[node.id.toString()] = currentStub;
                  }
                }
              }
            }

            stubCandidates[node.id.toString()] = {pathIndex: i, nodeIndex: j};
          });

          previousConnections = currentConnections;
          previousNodeIndices = currentNodeIndices;
        });
      },

      calcNodePositions: function () {
        var that = this;
        var straightenedConnections = {};

        that.pathWrappers.forEach(function (pathWrapper) {
          pathWrapper.nodePositions = d3.range(0, pathWrapper.path.nodes.length);
        });

        if (!alignPathNodes) {
          return;
        }

        //Calc node alignment

        //sort connections by lowest max node index
        this.crossConnections.sort(function (a, b) {
          return d3.ascending(a.maxNodeIndex, b.maxNodeIndex);
        });

        this.crossConnections.forEach(function (connection) {
          var maxPosition = -1;
          var maxNodeLocation = 0;
          connection.nodeLocations.forEach(function (nodeLocation) {
            var position = that.pathWrappers[nodeLocation.pathIndex].nodePositions[nodeLocation.nodeIndex];
            if (position > maxPosition) {
              maxPosition = position;
              maxNodeLocation = nodeLocation;
            }
          });

          connection.nodeLocations.forEach(function (nodeLocation) {
            shiftNodes(nodeLocation, maxNodeLocation, connection.nodeId);
          });

          var connections = straightenedConnections[connection.nodeId.toString()];
          if (typeof connections === "undefined") {
            connections = [];
            straightenedConnections[connection.nodeId.toString()] = connections;
          }
          connections.push(connection);

        });

        function shiftNodes(nodeLocation, maxNodeLocation, currentNodeId) {
          var currentPathWrapper = that.pathWrappers[nodeLocation.pathIndex];
          var refPosition = that.pathWrappers[maxNodeLocation.pathIndex].nodePositions[maxNodeLocation.nodeIndex];
          var currentPosition = currentPathWrapper.nodePositions[nodeLocation.nodeIndex];

          if (refPosition === currentPosition) {
            return;
          }


          //Always shift for pivot node
          if (that.pivotNodeId !== currentNodeId) {

            //If there is any straightened connection for one of the nodes after the current node, do not shift in this path
            for (var i = nodeLocation.nodeIndex + 1; i < currentPathWrapper.nodePositions.length; i++) {
              var connections = straightenedConnections[currentPathWrapper.path.nodes[i].id.toString()];

              if (typeof connections !== "undefined") {
                for (var j = 0; j < connections.length; j++) {
                  var connection = connections[j];
                  if (connection.nodeLocations[0].pathIndex <= nodeLocation.pathIndex && connection.nodeLocations[connection.nodeLocations.length - 1].pathIndex >= nodeLocation.pathIndex) {
                    return;
                  }
                }
              }
            }
          }

          var shift = refPosition - currentPosition;

          for (var i = nodeLocation.nodeIndex; i < currentPathWrapper.nodePositions.length; i++) {
            currentPathWrapper.nodePositions[i] += shift;
          }
        }
      },

      renderCrossConnections: function () {

        var that = this;
        var connectionContainer = this.parent.select("g.crossConnectionContainer");

        var line = d3.svg.line()
          .x(function (d) {
            var position = that.pathWrappers[d.pathIndex].nodePositions[d.nodeIndex];
            var translate = that.getPivotNodeAlignedTranslationX(that.pathWrappers[d.pathIndex]);
            return translate + position * (NODE_WIDTH + EDGE_SIZE) + NODE_WIDTH / 2;
          })
          .y(function (d) {
            var translate = getPathContainerTranslateY(that.pathWrappers, d.pathIndex);
            return d.top ? translate + (d.first ? PATH_HEIGHT / 2 : 0) : translate + (d.last ? PATH_HEIGHT / 2 : that.pathWrappers[d.pathIndex].getHeight());
          })
          .interpolate("linear");

        var allConnections = connectionContainer.selectAll("path.crossConnection")
          .data(this.crossConnections, function (d) {
            return d.id;
          });

        var connection = allConnections.enter()
          .append("path")
          .style({fill: "none"})
          .classed("crossConnection", true);


        allConnections
          .transition()
          .attr({
            d: function (d) {
              return line(d.nodeAnchors);
            }
          });

        allConnections.exit().remove();

        selectionUtil.removeListeners(that.connectionSelectionListener);

        that.connectionSelectionListener = selectionUtil.addDefaultListener(connectionContainer, "path.crossConnection", function (d) {
            return d.nodeId;
          },
          "node"
        );

        var allStubs = connectionContainer.selectAll("line.stub")
          .data(this.connectionStubs, function (d) {
            return d.id;
          });

        var stub = allStubs.enter()
          .append("line")
          .classed("stub", true);


        allStubs
          .transition()
          .attr({
            x1: function (d) {
              var position = that.pathWrappers[d.pathIndex].nodePositions[d.nodeIndex];
              var translate = that.getPivotNodeAlignedTranslationX(that.pathWrappers[d.pathIndex]);
              return translate + position * (NODE_WIDTH + EDGE_SIZE) + NODE_WIDTH / 2;
            },
            y1: function (d) {
              var translate = getPathContainerTranslateY(that.pathWrappers, d.pathIndex);
              return translate + (d.up ? 0 : PATH_HEIGHT / 2);
            },
            x2: function (d) {
              var position = that.pathWrappers[d.pathIndex].nodePositions[d.nodeIndex];
              var translate = that.getPivotNodeAlignedTranslationX(that.pathWrappers[d.pathIndex]);
              return translate + position * (NODE_WIDTH + EDGE_SIZE) + NODE_WIDTH / 2;
            },
            y2: function (d) {
              var translate = getPathContainerTranslateY(that.pathWrappers, d.pathIndex);
              return translate + (d.down ? PATH_HEIGHT : PATH_HEIGHT / 2);
            }
          });

        allStubs.exit().remove();

        selectionUtil.removeListeners(that.stubSelectionListener);

        that.stubSelectionListener = selectionUtil.addDefaultListener(connectionContainer, "line.stub", function (d) {
            return d.nodeId;
          },
          "node"
        );

      },

      renderSets: function (allSetTypes) {
        var that = this;


        allSetTypes.each(function (d) {

          if (d.setType.collapsed) {
            d3.select(this).selectAll("g.setCont")
              .remove();
            return;
          }

          var allSc = d3.select(this)
            .selectAll("g.setCont")
            .data(function () {
              var filteredSets = d.setType.sets.filter(function (s) {
                return s.canBeShown();
              });

              return filteredSets.map(function (myset) {
                return {
                  set: myset,
                  pathIndex: d.pathIndex,
                  setTypeIndex: that.pathWrappers[d.pathIndex].setTypes.indexOf(d.setType)
                };
              });
            }, function (d) {
              return d.set.id;
            });

          var sc = allSc
            .enter()
            .append("g")
            .classed("setCont", true);

          sc.each(function (d, i) {
            queryUtil.createAddNodeFilterButton(d3.select(this), that.parent, "set", d.set.id, NODE_START, 0, true);
          });

          allSc.attr({
            display: function (d) {
              if (d.set.canBeShown()) {
                return "inline";
              }
              return "none";
            },
            transform: getSetTransformFunction(that.pathWrappers)
          });

          var set = sc.append("g")
            .classed("set", true)
            .on("dblclick", function (d) {
              //sortingManager.addOrReplace(sortingStrategies.getSetPresenceStrategy([d.set.id]));
              sortingStrategies.selectionSortingStrategy.setSetIds([d.set.id]);
              listeners.notify(pathSorting.updateType, sortingManager.currentComparator);
              //sortingManager.sort(that.pathWrappers, parent, "g.pathContainer", getPathContainerTransformFunction(that.pathWrappers));
            });

          set.append("rect")
            .attr("class", "filler")
            .attr("x", 0)
            .attr("y", 0)
            .attr("width", "100%")
            .attr("height", SET_HEIGHT);

          set.append("text")
            .text(function (d) {
              return setInfo.getSetLabel(d.set.id);
            })
            .attr("x", SET_TYPE_INDENT)
            .attr("y", SET_HEIGHT)
            .style("fill", function (d) {
              return setInfo.getSetTypeInfo(that.pathWrappers[d.pathIndex].setTypes[d.setTypeIndex].type).color;
            })
            .attr("clip-path", "url(#SetLabelClipPath)");

          set.append("title")
            .text(function (d) {
              return setInfo.getSetLabel(d.set.id);
            });


          var setVisContainer = set.append("g")
            .classed("setVisContainer", true);


          //allSetVisContainers.attr("transform", function (d) {
          //  return that.getPivotNodeAlignedTransform(that.pathWrappers[d.pathIndex])
          //});

          setVisContainer.each(function (d) {
            var allCircles = d3.select(this).selectAll("circle")
              .data(function () {
                return d.set.nodeIndices.map(function (index) {
                  return {pathIndex: d.pathIndex, setTypeIndex: d.setTypeIndex, nodeIndex: index};
                });
              });

            allCircles.enter()
              .append("circle")
              .attr({
                cy: function (d) {
                  return SET_HEIGHT / 2;
                },
                r: 2,
                fill: function (d) {
                  return setInfo.getSetTypeInfo(that.pathWrappers[d.pathIndex].setTypes[d.setTypeIndex].type).color;
                }
              });


            allCircles.exit().remove();

            var allLines = d3.select(this).selectAll("line").
              data(function (d, i) {
                return d.set.relIndices.map(function (index) {
                  return {pathIndex: d.pathIndex, setTypeIndex: d.setTypeIndex, setIndex: i, relIndex: index};
                });
              });

            allLines.enter()
              .append("line")
              //.attr("x1", function (d) {
              //  return (d.relIndex * nodeWidth) + (d.relIndex * edgeSize) + nodeWidth / 2;
              //})
              .attr("y1", function (d) {
                return SET_HEIGHT / 2;
                //return 2 * vSpacing + nodeHeight + (d.setIndex + 1) * setHeight - 5;
              })
              //.attr("x2", function (d) {
              //  return ((d.relIndex + 1) * nodeWidth) + ((d.relIndex + 1) * edgeSize) + nodeWidth / 2;
              //})
              .attr("y2", function (d) {
                return SET_HEIGHT / 2;
                //return 2 * vSpacing + nodeHeight + (d.setIndex + 1) * setHeight - 5;
              })
              .attr("stroke", function (d) {
                return setInfo.getSetTypeInfo(that.pathWrappers[d.pathIndex].setTypes[d.setTypeIndex].type).color;
              });

            allLines.exit().remove();
          });


          d3.select(this).selectAll("g.setVisContainer")
            .each(function (d) {

              var allCircles = d3.select(this).selectAll("circle");

              allCircles.transition()
                .attr({
                  cx: function (d) {
                    var pivotNodeTranslate = that.getPivotNodeAlignedTranslationX(that.pathWrappers[d.pathIndex]);
                    var position = that.pathWrappers[d.pathIndex].nodePositions[d.nodeIndex];
                    return pivotNodeTranslate + position * (NODE_WIDTH + EDGE_SIZE) + NODE_WIDTH / 2;
                  }
                });

              var allLines = d3.select(this).selectAll("line");

              allLines.transition()
                .attr({
                  x1: function (d) {
                    var pivotNodeTranslate = that.getPivotNodeAlignedTranslationX(that.pathWrappers[d.pathIndex]);
                    var position = that.pathWrappers[d.pathIndex].nodePositions[d.relIndex];
                    return pivotNodeTranslate + position * (NODE_WIDTH + EDGE_SIZE) + NODE_WIDTH / 2;
                  },
                  x2: function (d) {
                    var pivotNodeTranslate = that.getPivotNodeAlignedTranslationX(that.pathWrappers[d.pathIndex]);
                    var position = that.pathWrappers[d.pathIndex].nodePositions[d.relIndex + 1];
                    return pivotNodeTranslate + position * (NODE_WIDTH + EDGE_SIZE) + NODE_WIDTH / 2;
                  }
                });

            });


          allSc.exit()
            .remove();

        });

        selectionUtil.removeListeners(that.setSelectionListener);

        that.setSelectionListener = selectionUtil.addDefaultListener(allSetTypes, "g.set", function (d) {
            return d.set.id;
          },
          "set"
        );

      },

      renderDatasets: function () {
        var that = this;
        var allDatasetGroups = that.parent.selectAll("g.pathContainer g.datasetGroup")
          .data(that.pathWrappers, getPathKey);

        allDatasetGroups.attr({
          transform: function (d) {
            return "translate(0," + (PATH_HEIGHT + d.getSetHeight()) + ")";
          }
        });

        allDatasetGroups.each(function (pathWrapper) {

          var allDatasets = d3.select(this).selectAll("g.dataset")
            .data(pathWrapper.datasets);

          var dataset = allDatasets.enter()
            .append("g")
            .classed("dataset", true);

          dataset.append("text")
            .attr("class", "collapseIconSmall");

          allDatasets.selectAll("text.collapseIconSmall")
            .attr("x", 5)
            .attr("y", SET_TYPE_HEIGHT)
            .text(function (d) {
              return d.collapsed ? "\uf0da" : "\uf0dd";
            })
            .on("click", function (d) {
              var collapsed = !d.collapsed;
              if (d3.event.ctrlKey) {
                listeners.notify(pathListUpdateTypes.COLLAPSE_ELEMENT_TYPE, {
                  type: d.name,
                  collapsed: collapsed
                });
              } else {
                d.collapsed = collapsed;
                d3.select(this).text(d.collapsed ? "\uf0da" : "\uf0dd");

                that.updatePathList();

              }
              //updateAggregateList(parent);
            });

          var datasetLabel = dataset.append("text")
            .attr({
              x: SET_TYPE_INDENT,
              y: DATASET_HEIGHT,
              "clip-path": "url(#SetLabelClipPath)"
            })
            .text(function (d) {
              return d.name;
            });

          datasetLabel.append("title")
            .text(function (d) {
              return d.name;
            });

          allDatasets.attr({
            transform: function (d, i) {
              var posY = 0;
              var datasetWrappers = pathWrapper.datasets;

              for (var j = 0; j < i; j++) {
                var datasetWrapper = datasetWrappers[j];
                if (datasetWrapper.canBeShown()) {
                  posY += datasetWrapper.getHeight();
                }
              }
              return ("translate(0, " + posY + ")");
            }
          });

          allDatasets.each(function (dataset) {

            if (dataset.collapsed) {
              d3.select(this).selectAll("g.dataGroup").remove();
              return;
            }

            var scaleY = d3.scale.linear().domain([dataset.minValue, dataset.maxValue]).range([DATA_GROUP_CONTENT_HEIGHT, 0]);

            var allGroups = d3.select(this).selectAll("g.dataGroup")
              .data(dataset.children);
            var group = allGroups.enter()
              .append("g")
              .classed("dataGroup", true);

            group.append("rect")
              .classed("background", true)
              .attr({
                x: SET_TYPE_INDENT,
                y: DATA_GROUP_V_PADDING,
                width: function (d) {
                  var pivotNodeTranslate = that.getPivotNodeAlignedTranslationX(pathWrapper);
                  var position = pathWrapper.nodePositions[pathWrapper.path.nodes.length - 1];
                  return pivotNodeTranslate + position * (NODE_WIDTH + EDGE_SIZE) + NODE_WIDTH;
                },
                height: DATA_GROUP_CONTENT_HEIGHT
              })
              .style({
                //stroke: "black",
                fill: "rgba(240,240,240,0.5)"
              });

            var yAxis = d3.svg.axis()
              .scale(scaleY)
              .orient("left")
              .ticks(3);

            group.append("g")
              .classed("boxPlotAxis", true)
              .attr("transform", "translate(" + NODE_START + "," + DATA_GROUP_V_PADDING + ")")
              .call(yAxis);

            var groupLabel = group.append("text")
              .attr({
                x: SET_TYPE_INDENT,
                y: 14,
                "clip-path": "url(#SetLabelClipPath)"
              })
              .text(function (d) {
                return d.name;
              });

            groupLabel.append("title")
              .text(function (d) {
                return d.name;
              });

            allGroups.attr({
              transform: function (d, i) {
                var posY = DATASET_HEIGHT;
                var groups = dataset.children;

                for (var j = 0; j < i; j++) {
                  var g = groups[j];
                  if (g.canBeShown()) {
                    posY += g.getHeight();
                  }
                }
                return ("translate(0, " + posY + ")");
              }
            });

            allGroups.each(function (group) {

              d3.select(this).select("rect.background")
                .transition()
                .attr({
                  width: function (d) {
                    var pivotNodeTranslate = that.getPivotNodeAlignedTranslationX(pathWrapper);
                    var position = pathWrapper.nodePositions[pathWrapper.path.nodes.length - 1];
                    return pivotNodeTranslate + position * (NODE_WIDTH + EDGE_SIZE) + NODE_WIDTH;
                  }
                });


              var allNodeData = d3.select(this).selectAll("g.nodeData")
                .data(pathWrapper.path.nodes);


              var nodeData = allNodeData.enter()
                .append("g")
                .classed("nodeData", true)
                .attr({
                  transform: "translate(0," + DATA_GROUP_V_PADDING + ")"
                });

              nodeData.append("title")
                .text(function (d) {
                  var stats = dataStore.getStatsForNode(d, dataset.name, group.name);
                  return "Elements: " + stats.data.length +
                    "\nNaNs: " + stats.nans +
                    "\nMedian: " + stats.median +
                    "\n1st Quartile: " + stats.quartile25 +
                    "\n3rd Quartile: " + stats.quartile75 +
                    "\nLowest value in 1.5xIQR range: " + stats.iqrMin +
                    "\nHighest value in 1.5xIQR range: " + stats.iqrMax +
                    "\nMin: " + stats.min +
                    "\nMax: " + stats.max;
                });

              nodeData.append("rect")
                .classed("box", true)
                .attr({
                  x: function (d, i) {
                    var pivotNodeTranslate = that.getPivotNodeAlignedTranslationX(pathWrapper);
                    var position = pathWrapper.nodePositions[i];
                    return pivotNodeTranslate + position * (NODE_WIDTH + EDGE_SIZE) + NODE_WIDTH / 2 - BOX_WIDTH / 2;
                  },
                  y: function (d) {
                    var stats = dataStore.getStatsForNode(d, dataset.name, group.name);
                    return scaleY(stats.quartile75);
                  },
                  width: BOX_WIDTH,
                  height: function (d) {
                    var stats = dataStore.getStatsForNode(d, dataset.name, group.name);
                    var height = scaleY(stats.quartile25) - scaleY(stats.quartile75);
                    return height;
                  }
                })
                .style({
                  fill: "gray",
                  stroke: "black"
                });

              d3.select(this).selectAll("g.nodeData rect.box")
                .transition()
                .attr({
                  x: function (d, i) {
                    var pivotNodeTranslate = that.getPivotNodeAlignedTranslationX(pathWrapper);
                    var position = pathWrapper.nodePositions[i];
                    return pivotNodeTranslate + position * (NODE_WIDTH + EDGE_SIZE) + NODE_WIDTH / 2 - BOX_WIDTH / 2;
                  },
                  y: function (d) {
                    var stats = dataStore.getStatsForNode(d, dataset.name, group.name);

                    return scaleY(stats.quartile75);
                    //return scaleY(stats.quartile25);
                  },
                  width: BOX_WIDTH,
                  height: function (d) {
                    var stats = dataStore.getStatsForNode(d, dataset.name, group.name);
                    var height = scaleY(stats.quartile25) - scaleY(stats.quartile75);

                    return height;
                  }
                });

              nodeData.append("line")
                .classed("median", true)
                .attr({
                  x1: function (d, i) {
                    var pivotNodeTranslate = that.getPivotNodeAlignedTranslationX(pathWrapper);
                    var position = pathWrapper.nodePositions[i];
                    return pivotNodeTranslate + position * (NODE_WIDTH + EDGE_SIZE) + NODE_WIDTH / 2 - BOX_WIDTH / 2;
                  },
                  y1: function (d) {
                    var stats = dataStore.getStatsForNode(d, dataset.name, group.name);
                    return scaleY(stats.median);
                  },
                  x2: function (d, i) {
                    var pivotNodeTranslate = that.getPivotNodeAlignedTranslationX(pathWrapper);
                    var position = pathWrapper.nodePositions[i];
                    return pivotNodeTranslate + position * (NODE_WIDTH + EDGE_SIZE) + NODE_WIDTH / 2 + BOX_WIDTH / 2;
                  },
                  y2: function (d) {
                    var stats = dataStore.getStatsForNode(d, dataset.name, group.name);
                    return scaleY(stats.median);
                  }
                })
                .style({
                  stroke: "white"
                });

              d3.select(this).selectAll("g.nodeData line.median")
                .transition()
                .attr({
                  x1: function (d, i) {
                    var pivotNodeTranslate = that.getPivotNodeAlignedTranslationX(pathWrapper);
                    var position = pathWrapper.nodePositions[i];
                    return pivotNodeTranslate + position * (NODE_WIDTH + EDGE_SIZE) + NODE_WIDTH / 2 - BOX_WIDTH / 2;
                  },
                  y1: function (d) {
                    var stats = dataStore.getStatsForNode(d, dataset.name, group.name);
                    return scaleY(stats.median);
                  },
                  x2: function (d, i) {
                    var pivotNodeTranslate = that.getPivotNodeAlignedTranslationX(pathWrapper);
                    var position = pathWrapper.nodePositions[i];
                    return pivotNodeTranslate + position * (NODE_WIDTH + EDGE_SIZE) + NODE_WIDTH / 2 + BOX_WIDTH / 2;
                  },
                  y2: function (d) {
                    var stats = dataStore.getStatsForNode(d, dataset.name, group.name);
                    return scaleY(stats.median);
                  }
                });

              nodeData.each(function (node, i) {

                var stats = dataStore.getStatsForNode(node, dataset.name, group.name);

                if (!isNaN(stats.iqrMin)) {

                  d3.select(this).append("line")
                    .classed("lowerWhisker", true)
                    .attr({
                      x1: function (d) {
                        var pivotNodeTranslate = that.getPivotNodeAlignedTranslationX(pathWrapper);
                        var position = pathWrapper.nodePositions[i];
                        return pivotNodeTranslate + position * (NODE_WIDTH + EDGE_SIZE) + NODE_WIDTH / 2 - BOX_WIDTH / 4;
                      },
                      y1: scaleY(stats.iqrMin),
                      x2: function (d) {
                        var pivotNodeTranslate = that.getPivotNodeAlignedTranslationX(pathWrapper);
                        var position = pathWrapper.nodePositions[i];
                        return pivotNodeTranslate + position * (NODE_WIDTH + EDGE_SIZE) + NODE_WIDTH / 2 + BOX_WIDTH / 4;
                      },
                      y2: scaleY(stats.iqrMin)
                    })
                    .style({
                      stroke: "black"
                    });

                  d3.select(this).append("line")
                    .classed("lowerWhiskerConnector", true)
                    .attr({
                      x1: function (d) {
                        var pivotNodeTranslate = that.getPivotNodeAlignedTranslationX(pathWrapper);
                        var position = pathWrapper.nodePositions[i];
                        return pivotNodeTranslate + position * (NODE_WIDTH + EDGE_SIZE) + NODE_WIDTH / 2;
                      },
                      y1: scaleY(stats.iqrMin),
                      x2: function (d) {
                        var pivotNodeTranslate = that.getPivotNodeAlignedTranslationX(pathWrapper);
                        var position = pathWrapper.nodePositions[i];
                        return pivotNodeTranslate + position * (NODE_WIDTH + EDGE_SIZE) + NODE_WIDTH / 2;
                      },
                      y2: scaleY(stats.quartile25)
                    })
                    .style({
                      stroke: "black"
                    });
                }

                if (!isNaN(stats.iqrMax)) {
                  d3.select(this).append("line")
                    .classed("upperWhisker", true)
                    .attr({
                      x1: function (d) {
                        var pivotNodeTranslate = that.getPivotNodeAlignedTranslationX(pathWrapper);
                        var position = pathWrapper.nodePositions[i];
                        return pivotNodeTranslate + position * (NODE_WIDTH + EDGE_SIZE) + NODE_WIDTH / 2 - BOX_WIDTH / 4;
                      },
                      y1: scaleY(stats.iqrMax),
                      x2: function (d) {
                        var pivotNodeTranslate = that.getPivotNodeAlignedTranslationX(pathWrapper);
                        var position = pathWrapper.nodePositions[i];
                        return pivotNodeTranslate + position * (NODE_WIDTH + EDGE_SIZE) + NODE_WIDTH / 2 + BOX_WIDTH / 4;
                      },
                      y2: scaleY(stats.iqrMax)
                    })
                    .style({
                      stroke: "black"
                    });

                  d3.select(this).append("line")
                    .classed("upperWhiskerConnector", true)
                    .attr({
                      x1: function (d) {
                        var pivotNodeTranslate = that.getPivotNodeAlignedTranslationX(pathWrapper);
                        var position = pathWrapper.nodePositions[i];
                        return pivotNodeTranslate + position * (NODE_WIDTH + EDGE_SIZE) + NODE_WIDTH / 2;
                      },
                      y1: scaleY(stats.iqrMax),
                      x2: function (d) {
                        var pivotNodeTranslate = that.getPivotNodeAlignedTranslationX(pathWrapper);
                        var position = pathWrapper.nodePositions[i];
                        return pivotNodeTranslate + position * (NODE_WIDTH + EDGE_SIZE) + NODE_WIDTH / 2;
                      },
                      y2: scaleY(stats.quartile75)
                    })
                    .style({
                      stroke: "black"
                    });
                }
              });


              allNodeData.each(function (node, nodeIndex) {
                d3.select(this).select("line.lowerWhisker")
                  .transition()
                  .attr({
                    x1: function (d) {
                      var pivotNodeTranslate = that.getPivotNodeAlignedTranslationX(pathWrapper);
                      var position = pathWrapper.nodePositions[nodeIndex];
                      return pivotNodeTranslate + position * (NODE_WIDTH + EDGE_SIZE) + NODE_WIDTH / 2 - BOX_WIDTH / 4;
                    },
                    x2: function (d) {
                      var pivotNodeTranslate = that.getPivotNodeAlignedTranslationX(pathWrapper);
                      var position = pathWrapper.nodePositions[nodeIndex];
                      return pivotNodeTranslate + position * (NODE_WIDTH + EDGE_SIZE) + NODE_WIDTH / 2 + BOX_WIDTH / 4;
                    }
                  });
                d3.select(this).select("line.lowerWhiskerConnector")
                  .transition()
                  .attr({
                    x1: function (d) {
                      var pivotNodeTranslate = that.getPivotNodeAlignedTranslationX(pathWrapper);
                      var position = pathWrapper.nodePositions[nodeIndex];
                      return pivotNodeTranslate + position * (NODE_WIDTH + EDGE_SIZE) + NODE_WIDTH / 2;
                    },
                    x2: function (d) {
                      var pivotNodeTranslate = that.getPivotNodeAlignedTranslationX(pathWrapper);
                      var position = pathWrapper.nodePositions[nodeIndex];
                      return pivotNodeTranslate + position * (NODE_WIDTH + EDGE_SIZE) + NODE_WIDTH / 2;
                    }
                  });

                d3.select(this).select("line.upperWhisker")
                  .transition()
                  .attr({
                    x1: function (d) {
                      var pivotNodeTranslate = that.getPivotNodeAlignedTranslationX(pathWrapper);
                      var position = pathWrapper.nodePositions[nodeIndex];
                      return pivotNodeTranslate + position * (NODE_WIDTH + EDGE_SIZE) + NODE_WIDTH / 2 - BOX_WIDTH / 4;
                    },
                    x2: function (d) {
                      var pivotNodeTranslate = that.getPivotNodeAlignedTranslationX(pathWrapper);
                      var position = pathWrapper.nodePositions[nodeIndex];
                      return pivotNodeTranslate + position * (NODE_WIDTH + EDGE_SIZE) + NODE_WIDTH / 2 + BOX_WIDTH / 4;
                    }
                  });

                d3.select(this).select("line.upperWhiskerConnector")
                  .transition()
                  .attr({
                    x1: function (d) {
                      var pivotNodeTranslate = that.getPivotNodeAlignedTranslationX(pathWrapper);
                      var position = pathWrapper.nodePositions[nodeIndex];
                      return pivotNodeTranslate + position * (NODE_WIDTH + EDGE_SIZE) + NODE_WIDTH / 2;
                    },
                    x2: function (d) {
                      var pivotNodeTranslate = that.getPivotNodeAlignedTranslationX(pathWrapper);
                      var position = pathWrapper.nodePositions[nodeIndex];
                      return pivotNodeTranslate + position * (NODE_WIDTH + EDGE_SIZE) + NODE_WIDTH / 2;
                    }
                  });

                var allPoints = d3.select(this).selectAll("g.dataPoint")
                  .data(dataStore.getDataForNode(node, dataset.name, group.name));

                var point = allPoints.enter()
                  .append("g")
                  .classed("dataPoint", true);

                point.append("circle")
                  .attr({

                    cx: function (d) {
                      var pivotNodeTranslate = that.getPivotNodeAlignedTranslationX(pathWrapper);
                      var position = pathWrapper.nodePositions[nodeIndex];
                      return pivotNodeTranslate + position * (NODE_WIDTH + EDGE_SIZE) + NODE_WIDTH / 2;
                    },

                    cy: function (d) {
                      return scaleY(d);
                    },
                    r: 1

                  })
                  .style({
                    opacity: 2,
                    fill: "red"
                  });

                allPoints.selectAll("circle")
                  .transition()
                  .attr({
                    cx: function (d) {
                      var pivotNodeTranslate = that.getPivotNodeAlignedTranslationX(pathWrapper);
                      var position = pathWrapper.nodePositions[nodeIndex];
                      return pivotNodeTranslate + position * (NODE_WIDTH + EDGE_SIZE) + NODE_WIDTH / 2;
                    },

                    cy: function (d) {
                      return scaleY(d);
                    }
                  });

                allPoints.exit().remove();

              });

              allNodeData.exit().remove();

            });

          });


          allDatasets.exit().remove();

        });

      },

      renderPaths: function () {

        var that = this;

        var nodeSetScale = this.getNodeSetScale();
        var edgeSetScale = this.getEdgeSetScale();

        var comparator = sortingManager.currentComparator;

        that.sortPaths(comparator);

        this.calcCrossConnections();
        this.calcNodePositions();
        this.renderCrossConnections();

        that.updateDataBinding();


        var allPathContainers = that.parent.selectAll("g.pathContainer")
          .data(that.pathWrappers, getPathKey);

        allPathContainers.sort(comparator)
          .transition()
          .attr("transform", getPathContainerTransformFunction(that.pathWrappers));


        var pathContainer = allPathContainers
          .enter()
          .append("g")
          .style("opacity", function (d) {
            if (pathQuery.isPathFiltered(d.path.id)) {
              return 0.5;
            }
            return 1;
          });


        pathContainer.attr("class", "pathContainer")
          .attr("transform", "translate(0," + that.getSize().height + ")");

        pathContainer.append("rect")
          .classed("pathContainerBackground", true)
          .attr("fill", "#A1D99B")
          .style("opacity", 0.8)
          .attr("x", 0)
          .attr("y", 0)
          .attr("width", "100%")
          .attr("height", function (pathWrapper) {
            return pathWrapper.getHeight();
          });


        //.attr("visibility", visible ? "visible" : "hidden");

        var p = pathContainer.append("g")
          .attr("class", "path");

        p.append("rect")
          .attr("class", "filler")
          .attr("x", 0)
          .attr("y", 0)
          .attr("width", "100%")
          .attr("height", PATH_HEIGHT);
        //.on("click", function(d) {
        //  console.log(d.path.id);
        //});

        p.append("text")
          .classed("pathRank", true)
          .attr({
            x: 5,
            y: PATH_HEIGHT / 2 + 5
          })
          .text(function (d) {
            return d.rank;
          });

        var l = selectionUtil.addDefaultListener(pathContainer, "g.path", function (d) {
            return d.path.id;
          },
          "path"
        );
        that.selectionListeners.push(l);

        var edgeGroup = p.append("g")
          .attr("class", "edgeGroup");
        //.attr("transform", function (d) {
        //  return that.getPivotNodeAlignedTransform(d)
        //});


        var allEdges = allPathContainers.selectAll("g.path").selectAll("g.edgeGroup").selectAll("g.edge")
          .data(function (pathWrapper, i) {
            return pathWrapper.path.edges.map(function (edge) {
              return {edge: edge, pathIndex: i};
            });
          });

        //var edge = edgeGroup.selectAll("g.edge")
        //  .data(function (pathWrapper, i) {
        //    return pathWrapper.path.edges.map(function (edge) {
        //      return {edge: edge, pathIndex: i};
        //    });
        //  })
        var edge = allEdges
          .enter()
          .append("g")
          .attr("class", "edge");

        edge.append("line")
          .attr("y1", V_SPACING + NODE_HEIGHT / 2)
          .attr("y2", V_SPACING + NODE_HEIGHT / 2)
          .attr("marker-end", function (d, i) {
            return isSourceNodeLeft(that.pathWrappers[d.pathIndex].path.nodes, d.edge, i) ? "url(#arrowRight)" : "";
          })
          .attr("marker-start", function (d, i) {
            return isSourceNodeLeft(that.pathWrappers[d.pathIndex].path.nodes, d.edge, i) ? "" : "url(#arrowRight)";
          })
          .attr("display", function (d) {
            return config.isNetworkEdge(d.edge) ? "inline" : "none";
          });

        allPathContainers.selectAll("g.path").selectAll("g.edgeGroup").selectAll("g.edge line")
          .data(function (pathWrapper, i) {
            return pathWrapper.path.edges.map(function (edge) {
              return {edge: edge, pathIndex: i};
            });
          });

        allPathContainers.each(function (d) {
          d3.select(this).selectAll("g.path g.edgeGroup g.edge line").transition()
            .attr({
              x1: function (d, i) {
                var pivotNodeTranslate = that.getPivotNodeAlignedTranslationX(that.pathWrappers[d.pathIndex]);
                var position = that.pathWrappers[d.pathIndex].nodePositions[i];
                return pivotNodeTranslate + position * (NODE_WIDTH + EDGE_SIZE);
              },
              x2: function (d, i) {
                var pivotNodeTranslate = that.getPivotNodeAlignedTranslationX(that.pathWrappers[d.pathIndex]);
                var position = that.pathWrappers[d.pathIndex].nodePositions[i + 1];
                return pivotNodeTranslate + position * (NODE_WIDTH + EDGE_SIZE);
              }
            });
        });


        var nodeGroup = p.append("g")
          .attr("class", "nodeGroup");
        //.attr("transform", function (d) {
        //  return that.getPivotNodeAlignedTransform(d)
        //});

        var allNodes = allPathContainers.selectAll("g.path").selectAll("g.nodeGroup").selectAll("g.nodeCont")
          .data(function (pathWrapper, i) {
            return pathWrapper.path.nodes.map(function (node) {
              return {node: node, pathIndex: i};
            });
          });

        //var node = nodeGroup.selectAll("g.node")
        //  .data(function (pathWrapper) {
        //    return pathWrapper.path.nodes;
        //  })
        var nc = allNodes.enter()
          .append("g")
          .classed("nodeCont", true);

        allNodes
          .transition()
          .attr("transform", function (d, i) {
            var position = that.pathWrappers[d.pathIndex].nodePositions[i];
            var pivotNodeTranslate = that.getPivotNodeAlignedTranslationX(that.pathWrappers[d.pathIndex]);
            return "translate(" + (pivotNodeTranslate + position * (NODE_WIDTH + EDGE_SIZE)) + "," + V_SPACING + ")";
          });

        nc.each(function (d, i) {
          queryUtil.createAddNodeFilterButton(d3.select(this), that.parent, "name", d.node.properties[config.getNodeNameProperty(d.node)], NODE_WIDTH, 0);
        });

        var node = nc
          .append("g")
          .attr("class", "node")

          .on("dblclick.align", function (d) {
            //sortingManager.addOrReplace(sortingStrategies.getNodePresenceStrategy([d.id]));
            sortingStrategies.selectionSortingStrategy.setNodeIds([d.node.id]);

            that.setPivotNode(d.node.id);

            listeners.notify(pathSorting.updateType, sortingManager.currentComparator);

            //if (d3.event.altKey) {

            //}
            //sortingManager.sort(that.pathWrappers, parent, "g.pathContainer", getPathContainerTransformFunction(that.pathWrappers));
          });

        var l = selectionUtil.addDefaultListener(nodeGroup, "g.node", function (d) {
            return d.node.id;
          },
          "node"
        );
        that.selectionListeners.push(l);


        node.append("rect")
          .attr("x", 0)
          .attr("y", 0)
          .attr("rx", 5).attr("ry", 5)
          .attr("width", NODE_WIDTH)
          .attr("height", NODE_HEIGHT);
        //.attr("fill", "rgb(200,200,200)")
        //.attr("stroke", "rgb(30,30,30)");

        node.append("text")
          .text(function (d) {
            return d.node.properties[config.getNodeNameProperty(d.node)];
          })
          .attr({
            x: function (d) {
              var text = d.node.properties[config.getNodeNameProperty(d.node)];
              var width = that.listView.getTextWidth(text);
              return NODE_WIDTH / 2 + Math.max(-width / 2, -NODE_WIDTH / 2 + 3);
            },
            y: +NODE_HEIGHT - 5,

            "clip-path": "url(#pathNodeClipPath)"
          })
          .append("title")
          .text(function (d) {
            return d.node.properties[config.getNodeNameProperty(d.node)];
          });


        var setGroup = pathContainer.append("g")
          .attr("class", "setGroup");

        var datasetGroup = pathContainer.append("g")
          .attr("class", "datasetGroup");


        var allSetTypes = allPathContainers.selectAll("g.setGroup").selectAll("g.setType")
          .data(function (pathWrapper, i) {
            return pathWrapper.setTypes.map(function (mySetType) {
              return {setType: mySetType, pathIndex: i};
            });
          });


        var setType = allSetTypes.enter()
            .append("g")
            .classed("setType", true)
            .attr({
              display: function (d) {

                if (d.setType.canBeShown()) {
                  return "inline";
                }
                return "none";
              },
              transform: getSetTypeTransformFunction(that.pathWrappers)
            }
          )
          ;

        setType.append("text")
          .attr("class", "collapseIconSmall");

        allSetTypes.selectAll("text.collapseIconSmall")
          .attr("x", 5)
          .attr("y", SET_TYPE_HEIGHT)
          .text(function (d) {
            return d.setType.collapsed ? "\uf0da" : "\uf0dd";
          })
          .on("click", function (d) {
            var collapsed = !d.setType.collapsed;
            if (d3.event.ctrlKey) {
              listeners.notify(pathListUpdateTypes.COLLAPSE_ELEMENT_TYPE, {type: d.setType.type, collapsed: collapsed});
            } else {
              d.setType.collapsed = collapsed;
              d3.select(this).text(d.setType.collapsed ? "\uf0da" : "\uf0dd");

              that.updatePathList();

            }
            //updateAggregateList(parent);
          });

        setType.append("text")
          .text(function (d) {
            //var text = d[0].id;
            //return getClampedText(text, 15);
            return config.getSetTypeFromSetPropertyName(d.setType.type);
          })
          .attr("x", 10)
          .attr("y", SET_TYPE_HEIGHT)
          .style("fill", function (d) {
            return setInfo.getSetTypeInfo(d.setType.type).color;
          })
          .attr("clip-path", "url(#SetLabelClipPath)");

        var setTypeSummaryContainer = setType.append("g")
          .classed("setTypeSummary", true)
          .attr("display", function (d) {
            return d.setType.collapsed ? "inline" : "none";
          });
        //.attr("transform", function (d) {
        //  return that.getPivotNodeAlignedTransform(that.pathWrappers[d.pathIndex]);
        //});

        setTypeSummaryContainer.each(function (d, i) {
            d3.select(this).selectAll("circle")
              .data(function () {
                return d.setType.nodeIndices.map(function (index) {
                  return {pathIndex: d.pathIndex, setTypeIndex: i, nodeIndex: index};
                });
              })
              .enter()
              .append("circle")
              .attr({
                cx: function (d, i) {
                  var pivotNodeTranslate = that.getPivotNodeAlignedTranslationX(that.pathWrappers[d.pathIndex]);
                  var position = that.pathWrappers[d.pathIndex].nodePositions[d.nodeIndex];
                  return pivotNodeTranslate + position * (NODE_WIDTH + EDGE_SIZE) + NODE_WIDTH / 2;
                },
                cy: SET_TYPE_HEIGHT / 2,
                r: function (d) {
                  var numSets = getNodeSetCount(that.pathWrappers[d.pathIndex].path.nodes[d.nodeIndex],
                    that.pathWrappers[d.pathIndex].setTypes[d.setTypeIndex]);
                  return nodeSetScale(numSets);
                },
                fill: function (d) {
                  return setInfo.getSetTypeInfo(that.pathWrappers[d.pathIndex].setTypes[d.setTypeIndex].type).color;
                }
              });


            d3.select(this).selectAll("line")
              .data(function () {
                return d.setType.relIndices.map(function (index) {
                  return {pathIndex: d.pathIndex, setTypeIndex: i, relIndex: index};
                });
              })
              .enter()
              .append("line")
              .attr({
                x1: function (d) {
                  var pivotNodeTranslate = that.getPivotNodeAlignedTranslationX(that.pathWrappers[d.pathIndex]);
                  var position = that.pathWrappers[d.pathIndex].nodePositions[d.relIndex];
                  return pivotNodeTranslate + position * (NODE_WIDTH + EDGE_SIZE) + NODE_WIDTH / 2;
                }
                ,
                y1: SET_TYPE_HEIGHT / 2,
                x2: function (d) {
                  var pivotNodeTranslate = that.getPivotNodeAlignedTranslationX(that.pathWrappers[d.pathIndex]);
                  var position = that.pathWrappers[d.pathIndex].nodePositions[d.relIndex + 1];
                  return pivotNodeTranslate + position * (NODE_WIDTH + EDGE_SIZE) + NODE_WIDTH / 2;
                },
                y2: SET_TYPE_HEIGHT / 2,
                stroke: function (d) {
                  return setInfo.getSetTypeInfo(that.pathWrappers[d.pathIndex].setTypes[d.setTypeIndex].type).color;
                },
                "stroke-width": function (d) {
                  var numSets = getEdgeSetCount(that.pathWrappers[d.pathIndex].path.edges[d.relIndex],
                    that.pathWrappers[d.pathIndex].setTypes[d.setTypeIndex]);
                  return edgeSetScale(numSets);
                }
              });
          }
        )
        ;

        that.renderSets(allSetTypes);

        that.renderDatasets();

        that.parent.selectAll("text.pathRank")
          .data(that.pathWrappers, getPathKey)
          .text(function (d) {
            return d.rank;
          });

        this.updatePathList();

        allPathContainers.exit()
          .transition()
          .attr("transform", "translate(0," + 2000 + ")")
          .remove();

        pathContainer.selectAll("rect.pathContainerBackground").transition()
          .duration(800)
          .style("opacity", 0);

      }

    };


    return PathList;
  }
);
