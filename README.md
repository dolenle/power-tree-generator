# Power Tree Generator

[Demo](https://dolenle.com/ptg_demo/)

In the context of electrical engineering, a power tree is a diagrammatic representation of the flow of power in a given system. Power supplying, converting, and consuming devices are represented as nodes in the tree. Links between the nodes signify electrical connections between the devices. Power trees are typically used by engineers to identify efficiency losses in a system, as well as to help identify potential power distribution issues in a design before it is manufactured.

There are three supported node types: Source, Rail and Load. The Source node acts as an ideal DC supply with a fixed voltage. The Rail node represents power regulators with a fixed efficiency and/or output voltage. Three sub-types are provided: DCDC converter (buck/boost), LDO (linear regulator), and LSW (load switch). Rails can be connected to Sources, or to other Rail nodes. Finally, Load nodes act as constant current sinks, and can be attached to Rails, or directly to Sources.

This is a browser-based power tree creation and visualization tool, written in Javascript and using the following plugins:
- [Treant.js](https://fperucic.github.io/treant-js/)
- [jQuery](https://jquery.com/)
- [jQuery UI](https://jqueryui.com/)
- [jQuery contextMenu](https://swisnl.github.io/jQuery-contextMenu/)

## Features
- Interactively add, remove, and drag/drop components in the power tree
- Easily edit node parameters by double-clicking
- Dynamically calculate power in/out and loss values for each component.
- Save and load power tree as a JSON file.

## TODO
This project is a WIP. PR's are welcome.
Some potential ideas for improvements:
- Compound nodes (with multiple parents) - currently not supported by Treant.js
- Color highlighting for separate rails/sources
- Export power tree as image
- Tooltips for drag-and-drop actions
- Option to toggle enable/disable nodes
- Aggregate power stats (e.g. overall efficiency, loss distribution)
- Animations
- Dynamic tree shape based on viewport size
- Detect invalid configurations
- Undo button
