/*
 * PowerTreeGen.js
 *
 * (c) 2023 Dolen Le (https://github.com/dolenle/)
 * Licensed under the terms of the MIT license.
 * 
 */

var config = {
    container: "#tree-container",
    rootOrientation: "WEST",
    hideRootNode: true,
    levelSeparation: 40,
    siblingSeparation: 40,
    // subTeeSeparation:    30,
    connectors: {
        type: 'step'
    },
}

console.log("Hello!");

class PtField {
    constructor(value, label, units, hidden=false, editable=false) {
        this.value = value;
        this.label = label;
        this.units = units;
        this.hidden = hidden;
        this.editable = editable;
        this.valueOf = function() {
            return this.value;
        }
        this.toString = function() {
            return this.label + ": " + dec_fmt.format(this.value) + " " + this.units;
        }
    }
}

class PtNode {
    constructor(parent, name) {
        this.parent = null;
        this.children = [];
        this.name = name;
        this.enabled = true;
        let self = this;
        this.fields = {
            get p_in() {
                if(this.v_in && this.i_in) {
                    let p_in = this.v_in * this.i_in;
                    return new PtField(p_in, "Input Power", "W");
                } else {
                    return null;
                }
            },
            get p_out() {
                if(this.v_out && this.i_out) {
                    let p_out = this.v_out * this.i_out;
                    return new PtField(p_out, "Output Power", "W");
                } else {
                    return null;
                }
            },
            get v_in() {
                if(self.parent != null && self.parent.fields.v_out) {
                    return new PtField(self.parent.fields.v_out.value, "Input Voltage", "V");
                } else {
                    return null;
                }
            },
        }
        if(parent) {
            this.parent = parent;
            parent.children.push(this);
        }
    }
    update(up=true) {}
    delete() {
        this.children.forEach(c => {
            c.delete();
        });
        if(this.parent) {
            this.parent.children = this.parent.children.filter(item => item !== this)
            this.parent.update();
        }
    }
    moveTo(parent) {
        if(this.parent) {
            this.parent.children = this.parent.children.filter(item => item !== this)
            if(parent === this.parent) {
                this.parent.children.unshift(this);
            } else {
                this.parent = parent;
                this.parent.children.push(this);
            }
        }
        this.update();
        parent.update();
    }
}

class PtSource extends PtNode {
    constructor(name, v_out) {
        super(null, name);
        this.fields.v_out = new PtField(v_out, "Output Voltage", "V", false, true);
        this.fields.i_out = new PtField(0, "Output Current", "A");
    }
    update(up=true) {
        let i_total = 0;
        this.children.forEach(c => {
            c.update(false);
            i_total += c.fields.i_in.value;
        });
        this.fields.i_out.value = i_total;
    }
}

class PtRail extends PtNode {
    static get LDO() {
        return "LDO";
    }
    static get DCDC() {
        return "DCDC";
    }
    static get LSW() {
        return "LSW";
    }
    constructor(parent, name, type, v_out, eff = 100) {
        super(parent, name);
        this.fields.i_in = new PtField(0, "Input Current", "A", false);
        if(type == PtRail.LDO) {
            this.fields.v_out = new PtField(v_out, "Output Voltage", "V", false, true);
            this.fields.i_out = new PtField(0, "Output Current", "A");
            this.fields.eff = new PtField(this.fields.v_out / this.parent.fields.v_in, "Efficiency", "%");
        } else if(type == PtRail.LSW) {
            this.fields.v_out = new PtField(this.fields.v_in.value, "Output Voltage", "V");
            this.fields.i_out = new PtField(0, "Output Current", "A", false);
            this.fields.eff = new PtField(eff, "RDS(ON)", "mΩ", false, true);
        } else if(type == PtRail.DCDC) {
            this.fields.p_in_int = new PtField(0, "P_I", "W", true, false); 
            this.fields.v_out = new PtField(v_out, "Output Voltage", "V", false, true);
            this.fields.i_out = new PtField(0, "Output Current", "A");
            this.fields.eff = new PtField(eff, "Efficiency", "%", false, true);
        } else {
            throw new Error('Unknown Rail Type: ' + type);
        }
        this.fields.loss = new PtField(this.fields.p_in-this.fields.p_out, "Power Loss", "W");
        this.type = type;
    }
    update(up=true) {
        let i_total = 0;
        this.children.forEach(c => {
            c.update(false);
            i_total += c.fields.i_in;
        });
        this.fields.i_out.value = i_total;
        if(this.type == PtRail.DCDC) {
            this.fields.p_in_int.value = this.fields.p_out / (this.fields.eff/100);
            this.fields.i_in.value = this.fields.p_in_int/this.fields.v_in;
        } else if(this.type == PtRail.LDO) {
            this.fields.eff.value = (this.fields.v_out / this.fields.v_in) * 100;
            this.fields.i_in.value = i_total;
        } else if(this.type == PtRail.LSW) {
            this.fields.i_in.value = i_total;
            this.fields.v_out.value = this.fields.v_in.value - i_total*(this.fields.eff/1000);
            // does this converge for constant p?
            this.children.forEach(c => {
                c.update(false);
            });
        }
        this.fields.loss.value = this.fields.p_in-this.fields.p_out;
        if(up) {
            this.parent.update(up);
        }
    }
}

class PtLoad extends PtNode {
    constructor(parent, name, i_in) {
        super(parent, name);
        this.fields.i_in = new PtField(i_in, "Input Current", "A", false, true);
        parent.update();
    }
    update(up=true) {
        if(up) {
            this.parent.update(up);
        }
    }
}

tree_root = {children:[]};
nodes_list = [config, tree_root];
sources_list = [];
nodes = {chart: config, nodeStructure: tree_root};

function generateTree(root, parent=null) {
    if(!parent) {
        tree_root.children.push(root);
    }
    if(root.children.length > 1) {
        root.stackChildren = true;
    }
    root.text = {
        name: root.name,
    }
    for(k in root.fields) {
        f = root.fields[k];
        if(f && f.hidden == false) {
            root.text[k] = String(f);
        }
    }

    root.image = "icon_menu.svg";
    root.meta = root;
    for(let c of root.children) {
        generateTree(c, root);
    }
}

const dec_fmt = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 1,      
    maximumFractionDigits: 3,
 });

function redraw() {
    if(typeof chart !== 'undefined') {
        chart.destroy();
    }
    tree_root.children = [];
    nodes = {chart: config, nodeStructure: tree_root};
    for(let s of sources_list) {
        generateTree(s);
    }
    chart = new Treant(nodes);

    $('.node > [class^="node-"]').dblclick(function(e) {
        let handle = e.currentTarget.parentElement.data.treenode.meta;
        startEditable(handle, $(this));
    });

    $(".node").droppable({
        accept: acceptDroppable,
        tolerance: "pointer",
        classes: {
            "ui-droppable-active": "drop-active",
            "ui-droppable-hover": "drop-hover",
        },
        drop: onDroppable,
    });

    $(".node").draggable({
        handle: "img",
        revert: "invalid",
        revertDuration: 240,
        stack: ".node",
        start: function(e) {
            $(this).addClass("dragging");
        },
        stop: function(e, ui) {
            let self = $(this);
            setTimeout(function(){self.removeClass("dragging");}, 50);
        },
    });

    $(".node > img").prop('title', "Click for menu; drag to move");

    $(".node > img").on('click', function(e) {
        if (!$(this).parent().hasClass('dragging')) {
            $(this).contextMenu();
        }
    });
}

function addSource() {
    let newsrc = new PtSource("New Source", 1);
    sources_list.push(newsrc);
    redraw();
}

function addRail(handle, type=PtRail.DCDC) {
    new PtRail(handle, "New "+type, type, 1, 85);
    redraw();
}

function addLoad(handle) {
    new PtLoad(handle, "New Load", 1);
    redraw();
}

function deleteNode(handle) {
    handle.delete();
    sources_list = sources_list.filter(item => item !== handle)
    redraw();
}

function onDroppable(e, ui) {
    let target = $(this)[0].data.treenode.meta;
    let drag = ui.draggable[0].data.treenode.meta;
    if(target instanceof PtLoad && target.parent === drag.parent) {
        console.log("SWAP");
        let ch = target.parent.children;
        let t_idx = ch.indexOf(target);
        let d_idx = ch.indexOf(drag);
        [ch[t_idx], ch[d_idx]] = [ch[d_idx], ch[t_idx]];
    } else {
        drag.moveTo(target);
    }
    redraw();
}

function acceptDroppable(node) {
    let ret = false;
    let target = $(this)[0].data.treenode.meta;
    let drag = node[0].data.treenode.meta;
    // target.constructor === drag.constructor
    if(target instanceof PtLoad && target.parent === drag.parent) {
        ret = true;
    } else if(drag instanceof PtLoad) {
        if(target instanceof PtLoad) {
            ret = false;
        } else {
            ret = true;
        }
    } else if(drag instanceof PtRail) {
        if(target instanceof PtLoad) {
            ret = false;
        } else if(drag.children.includes(target)) {
            ret = false;
        } else {
            ret = true;
        }
    } else {
        ret = false;
    }
    return ret;
}

function startEditableNumeric(key, handle, target) {
    // let content = target.text().substring(target.text().indexOf(':') + 1).trim();
    target.addClass("editing");
    target.html(handle.fields[key].label + ': <input class="input-num" type="number" step="0.01">&nbsp;' + handle.fields[key].units);
    target.children().val(handle.fields[key].value);
    target.children().focus(function() {
        $(this).select();
    }).bind("blur keyup", function(e) {
        if(e.type == "blur" || e.keyCode == 13) {
            let p = $(this).parent();
            handle.fields[key].value = Number($(this).val());
            handle.update();
            p.html(String(handle.fields[key]));
            p.removeClass("editing");
            redraw();
        }
    });
    target.children().focus();
}

function startEditable(handle, target) {
    if(target.attr('class') == "node-name") {
        let content = target.text();
        target.parent().children("img").hide();
        target.addClass("editing");
        target.html('<input class="input-txt" type="text">');
        target.children().val(content);
        target.children().focus(function() {
            $(this).select();
        }).bind("blur keyup", function(e) {
            if(e.type == "blur" || e.keyCode == 13) {
                let p = $(this).parent();
                p.parent().children("img").show();
                handle.name = $(this).val();
                p.html($(this).val());
                p.removeClass("editing");
            }
        });
        target.children().focus();
    } else if(!target.hasClass("editing")) {
        let item_key = target.attr('class').substring(target.attr('class').indexOf('-') + 1).split(' ')[0];
        if(handle.fields[item_key].editable) {
            startEditableNumeric(item_key, handle, target);
        } else {
            console.log(item_key + " is not editable!");
        }
    }
}

$( function() {
    // init example tree
    src_12v = new PtSource("12V_VIN", 12);
    let buck_5V = new PtRail(src_12v, "5V_BUCK", PtRail.DCDC, 5, 85);
    ldo_3v3 = new PtRail(buck_5V, "3V3_LDO", PtRail.LDO, 3.3);
    let ld_1 = new PtLoad(buck_5V, "LED Matrix", 1.4);
    let ld_2 = new PtLoad(ldo_3v3, "STM32_VDD", 0.1);
    let ld_3 = new PtLoad(ldo_3v3, "BME680_VDD", 0.05);
    sources_list.push(src_12v);

    redraw();
    $.contextMenu({
        selector: '.node',
        build: function($trigger, e) {
            console.log(e)
            let items = {};
            if(e.currentTarget.data.treenode.meta instanceof PtLoad) {
                items = {
                    "name": {name: e.currentTarget.data.treenode.meta.name, disabled: true},
                    "sep1": "---------",
                    // "en_dis": {name: "Disable", icon: "fa-power-off"},
                    "edit": {name: "Rename", icon: "fa-edit"},
                    "delete": {name: "Delete", icon: "fa-trash-can"},
                }
            } else {
                items = {
                    "name": {name: e.currentTarget.data.treenode.meta.name, disabled: true},
                    "sep1": "---------",
                    // "en_dis": {name: "Disable", icon: "fa-power-off"},
                    "add_load": {name: "Add Load",icon: "fa-microchip"},
                    "add_rail": {name: "Add Rail", icon: "fa-bolt",
                                    items: {
                                        add_ldo: {name: "LDO"},
                                        add_dcdc: {name: "DCDC"},
                                        add_lsw: {name: "Load Switch"},
                                    }
                                },
                    "edit": {name: "Rename", icon: "fa-edit"},
                    "delete": {name: "Delete", icon: "fa-trash-can"},
                }
            }
            return {
                callback: function(key, options) {
                    if(key == "add_dcdc") {
                        addRail(e.currentTarget.data.treenode.meta, PtRail.DCDC);
                    } else if(key == "add_ldo") {
                        addRail(e.currentTarget.data.treenode.meta, PtRail.LDO);
                    } else if(key == "add_lsw") {
                        addRail(e.currentTarget.data.treenode.meta, PtRail.LSW);
                    } else if(key == "add_load") {
                        addLoad(e.currentTarget.data.treenode.meta);
                    } else if(key == "edit") {
                        startEditable(e.currentTarget.data.treenode.meta, $(e.target.parentElement).children("p.node-name"));
                    } else if(key == "delete") {
                        deleteNode(e.currentTarget.data.treenode.meta);
                    }
                },
                items: items,
            };
        }
    });
} );
