"use strict";

class TextUtils {
    /**
     * Convert numbers in text to English words and replace + with "plus"
     * @param {string} text Text that may contain numbers and + symbols
     * @returns {string} Text with numbers converted to English words and + replaced with "plus"
     */
    static convertNumbersToEnglish(text) {
        if (!text) return text;
        
        // Replace basic symbols and text
        text = text.replace(/\+/g, ' plus ').replace(/\bAoE\b/g, 'AOE');
        
        const numberWords = {
            0: 'zero', 1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five', 
            6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten', 
            11: 'eleven', 12: 'twelve', 13: 'thirteen', 14: 'fourteen', 15: 'fifteen',
            16: 'sixteen', 17: 'seventeen', 18: 'eighteen', 19: 'nineteen',
            20: 'twenty', 30: 'thirty', 40: 'forty', 50: 'fifty',
            60: 'sixty', 70: 'seventy', 80: 'eighty', 90: 'ninety'
        };
        
        const ordinalWords = {
            1: 'first', 2: 'second', 3: 'third', 4: 'fourth', 5: 'fifth',
            6: 'sixth', 7: 'seventh', 8: 'eighth', 9: 'ninth', 10: 'tenth',
            11: 'eleventh', 12: 'twelfth', 13: 'thirteenth', 14: 'fourteenth', 15: 'fifteenth',
            16: 'sixteenth', 17: 'seventeenth', 18: 'eighteenth', 19: 'nineteenth', 20: 'twentieth',
            30: 'thirtieth', 40: 'fortieth', 50: 'fiftieth', 60: 'sixtieth', 
            70: 'seventieth', 80: 'eightieth', 90: 'ninetieth', 100: 'hundredth'
        };
        
        // Number conversion function
        const convertNumber = (num) => {
            num = parseInt(num);
            if (num === 0) return 'zero';
            if (num < 0 || num >= 10000) return num.toString();
            
            // Handle numbers less than 100
            const under100 = (n) => {
                if (n <= 20) return numberWords[n];
                const tens = Math.floor(n / 10) * 10;
                const ones = n % 10;
                return ones === 0 ? numberWords[tens] : `${numberWords[tens]} ${numberWords[ones]}`;
            };
            
            // Handle three and four-digit numbers
            if (num < 100) return under100(num);
            if (num < 1000) {
                const hundreds = Math.floor(num / 100);
                const remainder = num % 100;
                return remainder === 0 ? `${numberWords[hundreds]} hundred` : 
                    `${numberWords[hundreds]} hundred ${under100(remainder)}`;
            }
            
            // Handle four-digit numbers
            const thousands = Math.floor(num / 1000);
            const remainder = num % 1000;
            if (remainder === 0) return `${numberWords[thousands]} thousand`;
            
            const hundreds = Math.floor(remainder / 100);
            const tens = remainder % 100;
            
            if (hundreds === 0) return `${numberWords[thousands]} thousand ${under100(tens)}`;
            if (tens === 0) return `${numberWords[thousands]} thousand ${numberWords[hundreds]} hundred`;
            
            return `${numberWords[thousands]} thousand ${numberWords[hundreds]} hundred ${under100(tens)}`;
        };
        
        // Generate ordinal numbers
        const generateOrdinal = (num) => {
            num = parseInt(num);
            if (ordinalWords[num]) return ordinalWords[num];
            
            if (num < 100) {
                const tens = Math.floor(num / 10) * 10;
                const ones = num % 10;
                return ones === 0 ? `${numberWords[tens]}th` : `${numberWords[tens]} ${ordinalWords[ones]}`;
            }
            
            if (num < 1000) {
                const hundreds = Math.floor(num / 100);
                const remainder = num % 100;
                
                if (remainder === 0) return `${numberWords[hundreds]} hundredth`;
                if (ordinalWords[remainder]) return `${numberWords[hundreds]} hundred ${ordinalWords[remainder]}`;
                
                const tens = Math.floor(remainder / 10) * 10;
                const ones = remainder % 10;
                return ones === 0 ? `${numberWords[hundreds]} hundred ${numberWords[tens]}th` : 
                    `${numberWords[hundreds]} hundred ${numberWords[tens]} ${ordinalWords[ones]}`;
            }
            
            const thousands = Math.floor(num / 1000);
            const remainder = num % 1000;
            return remainder === 0 ? `${numberWords[thousands]} thousandth` : 
                `${numberWords[thousands]} thousand ${generateOrdinal(remainder)}`;
        };
        
        // Process various number formats
        const processNumberFormats = (inputText) => {
            const replacements = [
                // Special handling for text like "Waves (Left) 3rd fast"
                [/Waves\s*\([^)]+\)\s*(\d+)(nd|rd|th|st)\s+fast/gi, (match, num) => 
                    match.replace(/\d+(nd|rd|th|st)/, generateOrdinal(parseInt(num)))],
                [/\b(\d+)(nd|rd|th|st)\b/gi, (_, num) => generateOrdinal(parseInt(num))],
                [/\bx(\d+)\b/gi, (_, num) => `times ${convertNumber(parseInt(num))}`],
                [/(\d+)%/g, (_, num) => `${convertNumber(parseInt(num))} percent`],
                [/\b(\d+)\s*-\s*(\d+)\s*-\s*(\d+)\b/g, (_, n1, n2, n3) => 
                    `${convertNumber(n1)} dash ${convertNumber(n2)} dash ${convertNumber(n3)}`],
                [/\b(\d+)x(\d+)\b/g, (_, n1, n2) => `${convertNumber(n1)} times ${convertNumber(n2)}`],
                [/\b(\d+)x\s+([^\s,;:.!?]+(?:\s+[^\s,;:.!?]+)*)/g, (match, num) => 
                    `${convertNumber(parseInt(num))} times ${match.substring(match.indexOf('x ') + 2)}`],
                [/\b(\d+)x([A-Za-z][^\s,;:.!?]*)/g, (_, num, text) => 
                    `${convertNumber(parseInt(num))} times ${text}`],
                [/\b\d+\b/g, match => convertNumber(parseInt(match))]
            ];
            
            return replacements.reduce((text, [pattern, replacer]) => 
                text.replace(pattern, replacer), inputText);
        };
        
        // Process content inside parentheses first, then outside
        text = text.replace(/\(([^)]+)\)/g, (match, content) => 
            `(${processNumberFormats(content)})`
        );
        return processNumberFormats(text);
    }
}

module.exports = TextUtils;
