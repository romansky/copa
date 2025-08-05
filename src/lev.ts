export const lev = (a: string, b: string): number => {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    if (a.length > b.length) [a, b] = [b, a]; // keep a the shorter

    const dp = Array(a.length + 1).fill(0);
    for (let i = 0; i <= a.length; i++) dp[i] = i;

    for (let j = 1; j <= b.length; j++) {
        let prevDiag = j - 1; // value from dp[i-1] before overwrite
        dp[0] = j;
        for (let i = 1; i <= a.length; i++) {
            const temp = dp[i];
            const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
            dp[i] = Math.min(
                dp[i] + 1,      // deletion
                dp[i - 1] + 1,  // insertion
                prevDiag + cost // substitution
            );
            prevDiag = temp;
        }
    }
    return dp[a.length];
};