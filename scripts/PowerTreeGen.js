/*
 * PowerTreeGen.js
 *
 * (c) 2023 Dolen Le (https://github.com/dolenle/)
 * Licensed under the terms of the MIT license.
 * 
 */

JSON_VER = 0.1;

var config = {
    container: "#tree-container",
    rootOrientation: "WEST",
    hideRootNode: true,
    levelSeparation: 40,
    siblingSeparation: 40,
    subTeeSeparation: 60,
    connectors: {
        type: 'step'
    },
}

console.log("Hello!");

let dec_fmt = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
 });

class PtField {
    constructor(value, label, units, hidden=false, editable=false, index=0) {
        this.value = value;
        this.label = label;
        this.units = units;
        this.hidden = hidden;
        this.editable = editable;
        this.index = index;
        this.valueOf = function() {
            return this.value;
        }
        this.toString = function() {
            return this.label + ": " + dec_fmt.format(this.value) + " " + this.units;
        }
    }
}

class PtNode {
    constructor(parent, name="PtNode", disabled=false) {
        this.parent = null;
        this.children = [];
        this.name = name;
        this.disabled = disabled;
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
    update(up=true) {
        if(up) {
            this.parent.update(up);
        }
    }
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
    isParent(node) {
        for(let c of this.children) {
            if(c === node) {
                return true;
            } else {
                if(c.isParent(node)) {
                    return true;
                }
            }
        }
        return false;
    }
    toJSON(key) {
        let temp = {};
        let type = this.constructor.name;
        temp[type] = [];
        temp[type].push(this.name);
        temp[type].push(Number(this.disabled));
        temp.c = [];
        for(k in this.fields) {
            f = this.fields[k];
            if(f && f.editable) {
                temp[type].push(f.value);
            }
        }
        for(let c of this.children) {
            temp.c.push(c.toJSON());
        }
        if(temp.c.length == 0) {
            delete temp.c;
        }
        return temp;
    }
}

class PtSrc extends PtNode {
    constructor(name="PtSrc", disabled=false, v_out=12) {
        super(null, name, disabled);
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
    constructor(parent, name="PtRail", disabled=false, v_out, eff = 100) {
        super(parent, name, disabled=false);
        this.fields.i_in = new PtField(0, "Input Current", "A");
        this.fields.v_out = new PtField(v_out, "Output Voltage", "V");
        this.fields.i_out = new PtField(0, "Output Current", "A");
    }
    getTotalCurrent() {
        let i_total = 0;
        this.children.forEach(c => {
            c.update(false);
            i_total += c.fields.i_in;
        });
        this.fields.i_out.value = i_total;
        return i_total;
    }
    update(up=true) {
        this.fields.loss.value = this.fields.p_in-this.fields.p_out;
        super.update(up);
    }
}

class PtLDO extends PtRail {
    constructor(parent, name="PtLDO", disabled=false, v_out=1) {
        super(parent, name, disabled);
        this.fields.v_out.value = v_out;
        this.fields.v_out.editable = true;
        this.fields.eff = new PtField(this.fields.v_out / this.parent.fields.v_in * 100, "Efficiency", "%");
        this.fields.loss = new PtField(this.fields.p_in-this.fields.p_out, "Power Loss", "W");
    }
    update(up=true) {
        this.fields.i_in.value = this.getTotalCurrent();
        this.fields.eff.value = (this.fields.v_out / this.fields.v_in) * 100;
        super.update(up);
    }
}

class PtDCDC extends PtRail {
    constructor(parent, name="PtDCDC", disabled=false, v_out=1, eff=85) {
        super(parent, name, disabled);
        this.fields.v_out.value = v_out;
        this.fields.v_out.editable = true;
        this.fields.eff = new PtField(eff, "Efficiency", "%", false, true);
        this.fields.loss = new PtField(this.fields.p_in-this.fields.p_out, "Power Loss", "W");
        this.fields.p_in_int = new PtField(0, "P_I", "W", true, false); 
    }
    update(up=true) {
        this.getTotalCurrent();
        // this.fields.p_in_int.value = this.fields.p_out / (this.fields.eff/100);
        this.fields.i_in.value = this.fields.p_out/(this.fields.eff/100)/this.fields.v_in;
        super.update(up);
    }
}

class PtLSW extends PtRail {
    constructor(parent, name="PtLSW", disabled=false, rds=100) {
        super(parent, name, disabled);
        this.fields.v_out.value = this.fields.v_in.value;
        this.fields.rds = new PtField(rds, "RDS(ON)", "mΩ", false, true);
        this.fields.loss = new PtField(this.fields.p_in-this.fields.p_out, "Power Loss", "W");
    }
    update(up=true) {
        let num_iter = 0;
        let v_drop = 0;
        let v_last_drop = 0;
        let dv_last = Infinity;
        while (num_iter++ < 10) {
            this.fields.i_in.value = this.getTotalCurrent();
            v_drop = this.fields.i_in*(this.fields.rds/1000);
            this.fields.v_out.value = this.fields.v_in.value - v_drop;
            let dv = Math.abs(v_last_drop - v_drop);
            // console.log(dv);
            if(dv < 1e-6) { // close enough?
                break;
            } else if(num_iter++ > 10 || dv > dv_last) {
                console.log("Failed to converge!")
                break;
            }
            v_last_drop = v_drop;
            dv_last = dv;
        }
        super.update(up);
    }
}

class PtLd extends PtNode {
    constructor(parent, name="PtLd", disabled=false, i_in=1, qty=1) {
        super(parent, name, disabled);
        this.fields.i_in = new PtField(i_in, "Input Current", "A", false, true);
        this.fields.qty = new PtField(qty, "Quantity", "", true, true);
        parent.update();
    }
}

max_zidx = 0;
tree_root = {children:[]};
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

function redraw() {
    if(typeof chart !== 'undefined') {
        chart.destroy();
    }
    let sources_list = tree_root.children
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

function getLink() {
    let uri = window.location.protocol+"//"+window.location.host+window.location.pathname+"?s="+encodeURIComponent(JSON.stringify([JSON_VER, tree_root.children]));
    console.log("uriLen="+uri.length);
    // history.pushState(null, '', uri);
    navigator.clipboard.writeText(uri);
}

function saveFile() {
    let a = document.createElement("a");
    let file = new Blob([JSON.stringify([JSON_VER, tree_root.children])], {type: "application/json;charset=utf-8"});
    a.href = URL.createObjectURL(file);
    a.download = "powertree-"+Date.now()+".json";
    a.click();
    URL.revokeObjectURL(a.href);
}

function loadFile() {
    $('#loadfile').click();
    $('#loadfile').off();
    $('#loadfile').on("change", async event => {
        try {
            const input = event.target
            if (!input) throw new Error('null input')
            const [file] = input.files
            const text = await file.text()
            loadJSON(text);
        } catch {
            alert("Failed to parse file or incompatible version.");
        }
    });
}

function deserializePt(obj, parent=null) {
    let ptTbl = {
        "PtSrc" : (p, a) => {return new PtSrc(...a)},
        "PtLDO" : (p, a) => {return new PtLDO(p, ...a)},
        "PtDCDC" : (p, a) => {return new PtDCDC(p, ...a)},
        "PtLSW" : (p, a) => {return new PtLSW(p, ...a)},
        "PtLd" : (p, a) => {return new PtLd(p, ...a)},
    };
    let type = Object.keys(obj)[0];
    let node = ptTbl[type](parent, obj[type]);
    if(obj.c) {
        for(c of obj.c) {
            deserializePt(c, node)
        }
    }
    return node;
}

function loadJSON(input) {
    tree_root.children = [];
    let obj = JSON.parse(input);
    console.log(input);
    if(obj[0] == JSON_VER) {
        for(src of obj[1]) {
            tree_root.children.push(deserializePt(src));
        }
    } else {
        console.log("version mismatch!");
        throw new Error()
    }
    redraw();
}

function addSource() {
    let newsrc = new PtSrc("New Source", false, 1);
    tree_root.children.push(newsrc);
    redraw();
}

function onDroppable(e, ui) {
    let target = $(this)[0].data.treenode.meta;
    let drag = ui.draggable[0].data.treenode.meta;
    if(target instanceof PtLd && target.parent === drag.parent) {
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
    if(target instanceof PtLd && target.parent === drag.parent) {
        ret = true;
    } else if(drag instanceof PtLd) {
        if(target instanceof PtLd) {
            ret = false;
        } else {
            ret = true;
        }
    } else if(drag instanceof PtRail) {
        if(target instanceof PtLd) {
            ret = false;
        } else if(drag.isParent(target)) {
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
    let sparams = new URLSearchParams(window.location.search);
    let state = sparams.get("s");
    if(state) {
        console.log("Load from URI");
        try {
            loadJSON(state);
        } catch {
            alert("Invalid URL or incompatible data.")
        }
    } else {
        // init example tree
        let src_12v = new PtSrc("12V_VIN", false, 12);
        let buck_5V = new PtDCDC(src_12v, "5V_BUCK", false, 5, 85);
        let ldo_3v3 = new PtLDO(buck_5V, "3V3_LDO", false, 3.3);
        let ld_1 = new PtLd(buck_5V, "LED Matrix", false, 1.4);
        let ld_2 = new PtLd(ldo_3v3, "STM32_VDD", false, 0.1);
        let ld_3 = new PtLd(ldo_3v3, "BME680_VDD", false, 0.05);
        tree_root.children.push(src_12v);
        redraw();
    }

    $.contextMenu({
        selector: '.node',
        zIndex: () => {return max_zidx+1},
        build: function($trigger, e) {
            // console.log(e)
            $(".node").each((i, v) => {
                let zidx = parseInt($(v).css("zIndex"), 10);
                if(zidx > max_zidx) {
                    max_zidx = zidx;
                }
            });
            let items = {
                "name": {name: e.currentTarget.data.treenode.meta.name, disabled: true},
                "sep1": "---------",
                // "en_dis": {name: "Disable", icon: "fa-power-off"},
            };
            if(!(e.currentTarget.data.treenode.meta instanceof PtLd)) {
                Object.assign(items, {
                    "add_load": {name: "Add Load",icon: "fa-microchip"},
                    "add_rail": {name: "Add Rail", icon: "fa-bolt", items: {
                                    add_ldo: {name: "LDO"},
                                    add_dcdc: {name: "DCDC"},
                                    add_lsw: {name: "Load Switch"},
                                }},
                });
            }
            Object.assign(items, {
                "edit": {name: "Rename", icon: "fa-edit"},
                "delete": {name: "Delete", icon: "fa-trash-can"},
            });
            return {
                callback: function(key, options) {
                    let handle =e.currentTarget.data.treenode.meta;
                    if(key == "edit") {
                        startEditable(handle, $(e.target.parentElement).children("p.node-name"));
                    } else {
                        if(key == "add_dcdc") {
                            new PtDCDC(handle, "New DCDC");
                        } else if(key == "add_ldo") {
                            new PtLDO(handle, "New LDO");
                        } else if(key == "add_lsw") {
                            new PtLSW(handle, "New Load Switch");
                        } else if(key == "add_load") {
                            new PtLd(handle, "New Load");
                        } else if(key == "delete") {
                            handle.delete();
                            tree_root.children = tree_root.children.filter(item => item !== handle)
                        }
                        redraw();
                    }
                },
                items: items,
            };
        }
    });
} );
