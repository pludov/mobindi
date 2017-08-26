

// Generate id that are alphabetically sorted
class IdGenerator {
    constructor()
    {
        this.value = "00000000";
    }


    current() {
        return this.value;
    }

    next() {

        function inc(str, at)
        {
            var c = str.charCodeAt(at);
            console.log('c=', c);
            if (c >= 48 && c < 48 + 9) {
                c++;
            } else if (c == 48 + 9) {
                // 'A'
                c = 65;
            } else if (c >= 65 && c < 90) {
                c++;
            } else {
                // Z => back to 0, with inc
                if (at == 0) {
                    throw new Error("Id overflow !");
                }
                str = inc(str, at - 1);
                c = 48;
            }
            str = str.substr(0,at) + String.fromCharCode(c) + str.substr(at + 1);
            return str;
        }

        this.value = inc(this.value, this.value.length - 1);
        return this.value;
    }
}

module.exports = {IdGenerator}