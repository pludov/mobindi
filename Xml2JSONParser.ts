import SAX from 'sax';

interface SchemaEntries {[id:string]:Schema};
interface SchemaProps {
    $notext?: boolean;
    $isArray?: boolean;
}

export type Schema = SchemaProps & SchemaEntries;

/**
 * @param level the level of message to send (1 = top level, 2 = childs of top level, ...)
 */
export function xml2JsonParser(schema:Schema, level:number, onMessage:(node:any)=>(void)):SAX.SAXParser {
    var parser = SAX.parser(true, {});

    var currentNodes:any[] = [];
    var currentSchemas:Schema[] = [];
    var currentLevel = 0;

    parser.onopentag = function (node) {
        var name = node.name;
        currentLevel++;
        if (currentLevel >= level) {
            var id = currentLevel - level;

            if (id == 0) {
                currentSchemas[id] = schema[name];
            } else {
                currentSchemas[id] = currentSchemas[id - 1][name];
            }
            if (currentSchemas[id] == undefined) {
                currentSchemas[id] = {};
            }

            var currentSchema = currentSchemas[id];
            
            var newNode:any = {};
        
            if (id == 0) {
                newNode.$$=name;
            } else {
                if (currentSchema.$isArray) {
                    currentNodes[id - 1][name].push(newNode);
                } else {
                    currentNodes[id - 1][name] = newNode;
                }
            }
            for(var key in node.attributes) {
                newNode['$' + key] = node.attributes[key];
            }
        
            for(var childId in currentSchema) {
                if (currentSchema[childId].$isArray) {
                    newNode[childId] = [];
                }
            }

            currentNodes[id] = newNode;
        }
    };

    parser.ontext = function(text) {
        var id = currentLevel - level;
        if (id >= 0) {
            if (currentSchemas[id].$notext) {
                return;
            }
            // Hackish: trim but keep possibility to have \n
            text = text.replace(/^\n/, '');
            text = text.replace(/\n *$/, '');
            currentNodes[id].$_ = text;
        }
    }

    parser.onclosetag = function (name) {
        currentLevel--;
        if (currentLevel ==  level - 1) {
            // End of current message
            console.log('finished message parsing: ' + JSON.stringify(currentNodes[0]));
            onMessage(currentNodes[0]);
        }
        if (currentLevel >= level - 1) {
            delete currentNodes[currentLevel - (level - 1)];
        }
    };

    return parser;
}

