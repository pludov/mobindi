/**
 * Aberration calculations for astronomical coordinates
 * Converted/adapted/reworked from libnova C library
 *
 * Original copyright:
 * Copyright (C) 2000 - 2005 Liam Girdwood
 * Copyright (C) 2015 Jeroen Vreeken (jeroen@vreeken.net)
 */

const TERMS = 36;

// Data structures to hold arguments and coefficients of Ron-Vondrak theory
const argumentsData = [
    // L2  L3  L4  L5  L6  L7  L8  LL  D   MM  F
    {a_L2: 0, a_L3: 1, a_L4: 0, a_L5: 0, a_L6: 0, a_L7: 0, a_L8: 0, a_LL: 0, a_D: 0, a_MM: 0, a_F: 0},
    {a_L2: 0, a_L3: 2, a_L4: 0, a_L5: 0, a_L6: 0, a_L7: 0, a_L8: 0, a_LL: 0, a_D: 0, a_MM: 0, a_F: 0},
    {a_L2: 0, a_L3: 0, a_L4: 0, a_L5: 1, a_L6: 0, a_L7: 0, a_L8: 0, a_LL: 0, a_D: 0, a_MM: 0, a_F: 0},
    {a_L2: 0, a_L3: 0, a_L4: 0, a_L5: 0, a_L6: 0, a_L7: 0, a_L8: 0, a_LL: 1, a_D: 0, a_MM: 0, a_F: 0},
    {a_L2: 0, a_L3: 3, a_L4: 0, a_L5: 0, a_L6: 0, a_L7: 0, a_L8: 0, a_LL: 0, a_D: 0, a_MM: 0, a_F: 0},
    {a_L2: 0, a_L3: 0, a_L4: 0, a_L5: 0, a_L6: 1, a_L7: 0, a_L8: 0, a_LL: 0, a_D: 0, a_MM: 0, a_F: 0},
    {a_L2: 0, a_L3: 0, a_L4: 0, a_L5: 0, a_L6: 0, a_L7: 0, a_L8: 0, a_LL: 0, a_D: 0, a_MM: 0, a_F: 1},
    {a_L2: 0, a_L3: 0, a_L4: 0, a_L5: 0, a_L6: 0, a_L7: 0, a_L8: 0, a_LL: 1, a_D: 0, a_MM: 1, a_F: 0},
    {a_L2: 0, a_L3: 0, a_L4: 0, a_L5: 2, a_L6: 0, a_L7: 0, a_L8: 0, a_LL: 0, a_D: 0, a_MM: 0, a_F: 0},
    {a_L2: 0, a_L3: 2, a_L4: 0, a_L5: -1, a_L6: 0, a_L7: 0, a_L8: 0, a_LL: 0, a_D: 0, a_MM: 0, a_F: 0},
    {a_L2: 0, a_L3: 3, a_L4: -8, a_L5: 3, a_L6: 0, a_L7: 0, a_L8: 0, a_LL: 0, a_D: 0, a_MM: 0, a_F: 0},
    {a_L2: 0, a_L3: 5, a_L4: -8, a_L5: 3, a_L6: 0, a_L7: 0, a_L8: 0, a_LL: 0, a_D: 0, a_MM: 0, a_F: 0},
    {a_L2: 2, a_L3: -1, a_L4: 0, a_L5: 0, a_L6: 0, a_L7: 0, a_L8: 0, a_LL: 0, a_D: 0, a_MM: 0, a_F: 0},
    {a_L2: 1, a_L3: 0, a_L4: 0, a_L5: 0, a_L6: 0, a_L7: 0, a_L8: 0, a_LL: 0, a_D: 0, a_MM: 0, a_F: 0},
    {a_L2: 0, a_L3: 0, a_L4: 0, a_L5: 0, a_L6: 0, a_L7: 1, a_L8: 0, a_LL: 0, a_D: 0, a_MM: 0, a_F: 0},
    {a_L2: 0, a_L3: 1, a_L4: 0, a_L5: -2, a_L6: 0, a_L7: 0, a_L8: 0, a_LL: 0, a_D: 0, a_MM: 0, a_F: 0},
    {a_L2: 0, a_L3: 0, a_L4: 0, a_L5: 0, a_L6: 0, a_L7: 0, a_L8: 1, a_LL: 0, a_D: 0, a_MM: 0, a_F: 0},
    {a_L2: 0, a_L3: 1, a_L4: 0, a_L5: 1, a_L6: 0, a_L7: 0, a_L8: 0, a_LL: 0, a_D: 0, a_MM: 0, a_F: 0},
    {a_L2: 2, a_L3: -2, a_L4: 0, a_L5: 0, a_L6: 0, a_L7: 0, a_L8: 0, a_LL: 0, a_D: 0, a_MM: 0, a_F: 0},
    {a_L2: 0, a_L3: 1, a_L4: 0, a_L5: -1, a_L6: 0, a_L7: 0, a_L8: 0, a_LL: 0, a_D: 0, a_MM: 0, a_F: 0},
    {a_L2: 0, a_L3: 4, a_L4: 0, a_L5: 0, a_L6: 0, a_L7: 0, a_L8: 0, a_LL: 0, a_D: 0, a_MM: 0, a_F: 0},
    {a_L2: 0, a_L3: 3, a_L4: 0, a_L5: -2, a_L6: 0, a_L7: 0, a_L8: 0, a_LL: 0, a_D: 0, a_MM: 0, a_F: 0},
    {a_L2: 1, a_L3: -2, a_L4: 0, a_L5: 0, a_L6: 0, a_L7: 0, a_L8: 0, a_LL: 0, a_D: 0, a_MM: 0, a_F: 0},
    {a_L2: 2, a_L3: -3, a_L4: 0, a_L5: 0, a_L6: 0, a_L7: 0, a_L8: 0, a_LL: 0, a_D: 0, a_MM: 0, a_F: 0},
    {a_L2: 0, a_L3: 0, a_L4: 0, a_L5: 0, a_L6: 2, a_L7: 0, a_L8: 0, a_LL: 0, a_D: 0, a_MM: 0, a_F: 0},
    {a_L2: 2, a_L3: 4, a_L4: 0, a_L5: 0, a_L6: 0, a_L7: 0, a_L8: 0, a_LL: 0, a_D: 0, a_MM: 0, a_F: 0},
    {a_L2: 0, a_L3: 3, a_L4: -2, a_L5: 0, a_L6: 0, a_L7: 0, a_L8: 0, a_LL: 0, a_D: 0, a_MM: 0, a_F: 0},
    {a_L2: 0, a_L3: 0, a_L4: 0, a_L5: 0, a_L6: 0, a_L7: 0, a_L8: 0, a_LL: 1, a_D: 2, a_MM: -1, a_F: 0},
    {a_L2: 8, a_L3: 12, a_L4: 0, a_L5: 0, a_L6: 0, a_L7: 0, a_L8: 0, a_LL: 0, a_D: 0, a_MM: 0, a_F: 0},
    {a_L2: 8, a_L3: 14, a_L4: 0, a_L5: 0, a_L6: 0, a_L7: 0, a_L8: 0, a_LL: 0, a_D: 0, a_MM: 0, a_F: 0},
    {a_L2: 0, a_L3: 0, a_L4: 2, a_L5: 0, a_L6: 0, a_L7: 0, a_L8: 0, a_LL: 0, a_D: 0, a_MM: 0, a_F: 0},
    {a_L2: 3, a_L3: 4, a_L4: 0, a_L5: 0, a_L6: 0, a_L7: 0, a_L8: 0, a_LL: 0, a_D: 0, a_MM: 0, a_F: 0},
    {a_L2: 0, a_L3: 2, a_L4: 0, a_L5: -2, a_L6: 0, a_L7: 0, a_L8: 0, a_LL: 0, a_D: 0, a_MM: 0, a_F: 0},
    {a_L2: 3, a_L3: -3, a_L4: 0, a_L5: 0, a_L6: 0, a_L7: 0, a_L8: 0, a_LL: 0, a_D: 0, a_MM: 0, a_F: 0},
    {a_L2: 0, a_L3: 2, a_L4: -2, a_L5: 0, a_L6: 0, a_L7: 0, a_L8: 0, a_LL: 0, a_D: 0, a_MM: 0, a_F: 0},
    {a_L2: 0, a_L3: 0, a_L4: 0, a_L5: 0, a_L6: 0, a_L7: 0, a_L8: 0, a_LL: 1, a_D: -2, a_MM: 0, a_F: 0}
];

const x_coefficients = [
    {sin1: -1719914, sin2: -2, cos1: -25, cos2: 0},
    {sin1: 6434, sin2: 141, cos1: 28007, cos2: -107},
    {sin1: 715, sin2: 0, cos1: 0, cos2: 0},
    {sin1: 715, sin2: 0, cos1: 0, cos2: 0},
    {sin1: 486, sin2: -5, cos1: -236, cos2: -4},
    {sin1: 159, sin2: 0, cos1: 0, cos2: 0},
    {sin1: 0, sin2: 0, cos1: 0, cos2: 0},
    {sin1: 39, sin2: 0, cos1: 0, cos2: 0},
    {sin1: 33, sin2: 0, cos1: -10, cos2: 0},
    {sin1: 31, sin2: 0, cos1: 1, cos2: 0},
    {sin1: 8, sin2: 0, cos1: -28, cos2: 0},
    {sin1: 8, sin2: 0, cos1: -28, cos2: 0},
    {sin1: 21, sin2: 0, cos1: 0, cos2: 0},
    {sin1: -19, sin2: 0, cos1: 0, cos2: 0},
    {sin1: 17, sin2: 0, cos1: 0, cos2: 0},
    {sin1: 16, sin2: 0, cos1: 0, cos2: 0},
    {sin1: 16, sin2: 0, cos1: 0, cos2: 0},
    {sin1: 11, sin2: 0, cos1: -1, cos2: 0},
    {sin1: 0, sin2: 0, cos1: -11, cos2: 0},
    {sin1: -11, sin2: 0, cos1: -2, cos2: 0},
    {sin1: -7, sin2: 0, cos1: -8, cos2: 0},
    {sin1: -10, sin2: 0, cos1: 0, cos2: 0},
    {sin1: -9, sin2: 0, cos1: 0, cos2: 0},
    {sin1: -9, sin2: 0, cos1: 0, cos2: 0},
    {sin1: 0, sin2: 0, cos1: -9, cos2: 0},
    {sin1: 0, sin2: 0, cos1: -9, cos2: 0},
    {sin1: 8, sin2: 0, cos1: 0, cos2: 0},
    {sin1: 8, sin2: 0, cos1: 0, cos2: 0},
    {sin1: -4, sin2: 0, cos1: -7, cos2: 0},
    {sin1: -4, sin2: 0, cos1: -7, cos2: 0},
    {sin1: -6, sin2: 0, cos1: -5, cos2: 0},
    {sin1: -1, sin2: 0, cos1: -1, cos2: 0},
    {sin1: 4, sin2: 0, cos1: -6, cos2: 0},
    {sin1: 0, sin2: 0, cos1: -7, cos2: 0},
    {sin1: 5, sin2: 0, cos1: -5, cos2: 0},
    {sin1: 5, sin2: 0, cos1: 0, cos2: 0}
];

const y_coefficients = [
    {sin1: 25, sin2: -13, cos1: 1578089, cos2: 156},
    {sin1: 25697, sin2: -95, cos1: -5904, cos2: -130},
    {sin1: 6, sin2: 0, cos1: -657, cos2: 0},
    {sin1: 0, sin2: 0, cos1: -656, cos2: 0},
    {sin1: -216, sin2: -4, cos1: -446, cos2: 5},
    {sin1: 2, sin2: 0, cos1: -147, cos2: 0},
    {sin1: 0, sin2: 0, cos1: 26, cos2: 0},
    {sin1: 0, sin2: 0, cos1: -36, cos2: 0},
    {sin1: -9, sin2: 0, cos1: -30, cos2: 0},
    {sin1: 1, sin2: 0, cos1: -28, cos2: 0},
    {sin1: 25, sin2: 0, cos1: 8, cos2: 0},
    {sin1: -25, sin2: 0, cos1: -8, cos2: 0},
    {sin1: 0, sin2: 0, cos1: -19, cos2: 0},
    {sin1: 0, sin2: 0, cos1: 17, cos2: 0},
    {sin1: 0, sin2: 0, cos1: -16, cos2: 0},
    {sin1: 0, sin2: 0, cos1: 15, cos2: 0},
    {sin1: 1, sin2: 0, cos1: -15, cos2: 0},
    {sin1: -1, sin2: 0, cos1: -10, cos2: 0},
    {sin1: -10, sin2: 0, cos1: 0, cos2: 0},
    {sin1: -2, sin2: 0, cos1: 9, cos2: 0},
    {sin1: -8, sin2: 0, cos1: 6, cos2: 0},
    {sin1: 0, sin2: 0, cos1: 9, cos2: 0},
    {sin1: 0, sin2: 0, cos1: -9, cos2: 0},
    {sin1: 0, sin2: 0, cos1: -8, cos2: 0},
    {sin1: -8, sin2: 0, cos1: 0, cos2: 0},
    {sin1: 8, sin2: 0, cos1: 0, cos2: 0},
    {sin1: 0, sin2: 0, cos1: -8, cos2: 0},
    {sin1: 0, sin2: 0, cos1: -7, cos2: 0},
    {sin1: -6, sin2: 0, cos1: -4, cos2: 0},
    {sin1: 6, sin2: 0, cos1: -4, cos2: 0},
    {sin1: -4, sin2: 0, cos1: 5, cos2: 0},
    {sin1: -2, sin2: 0, cos1: -7, cos2: 0},
    {sin1: -5, sin2: 0, cos1: -4, cos2: 0},
    {sin1: -6, sin2: 0, cos1: 0, cos2: 0},
    {sin1: -4, sin2: 0, cos1: -5, cos2: 0},
    {sin1: 0, sin2: 0, cos1: -5, cos2: 0}
];

const z_coefficients = [
    {sin1: 10, sin2: 32, cos1: 684185, cos2: -358},
    {sin1: 11141, sin2: -48, cos1: -2559, cos2: -55},
    {sin1: -15, sin2: 0, cos1: -282, cos2: 0},
    {sin1: 0, sin2: 0, cos1: -285, cos2: 0},
    {sin1: -94, sin2: 0, cos1: -193, cos2: 0},
    {sin1: -6, sin2: 0, cos1: -61, cos2: 0},
    {sin1: 0, sin2: 0, cos1: 59, cos2: 0},
    {sin1: 0, sin2: 0, cos1: 16, cos2: 0},
    {sin1: -5, sin2: 0, cos1: -13, cos2: 0},
    {sin1: 0, sin2: 0, cos1: -12, cos2: 0},
    {sin1: 11, sin2: 0, cos1: 3, cos2: 0},
    {sin1: -11, sin2: 0, cos1: -3, cos2: 0},
    {sin1: 0, sin2: 0, cos1: -8, cos2: 0},
    {sin1: 0, sin2: 0, cos1: 8, cos2: 0},
    {sin1: 0, sin2: 0, cos1: -7, cos2: 0},
    {sin1: 1, sin2: 0, cos1: 7, cos2: 0},
    {sin1: -3, sin2: 0, cos1: -6, cos2: 0},
    {sin1: -1, sin2: 0, cos1: 5, cos2: 0},
    {sin1: -4, sin2: 0, cos1: 0, cos2: 0},
    {sin1: -1, sin2: 0, cos1: 4, cos2: 0},
    {sin1: -3, sin2: 0, cos1: 3, cos2: 0},
    {sin1: 0, sin2: 0, cos1: 4, cos2: 0},
    {sin1: 0, sin2: 0, cos1: -4, cos2: 0},
    {sin1: 0, sin2: 0, cos1: -4, cos2: 0},
    {sin1: -3, sin2: 0, cos1: 0, cos2: 0},
    {sin1: 3, sin2: 0, cos1: 0, cos2: 0},
    {sin1: 0, sin2: 0, cos1: -3, cos2: 0},
    {sin1: 0, sin2: 0, cos1: -3, cos2: 0},
    {sin1: -3, sin2: 0, cos1: 2, cos2: 0},
    {sin1: 3, sin2: 0, cos1: -2, cos2: 0},
    {sin1: -2, sin2: 0, cos1: 2, cos2: 0},
    {sin1: 1, sin2: 0, cos1: -4, cos2: 0},
    {sin1: -2, sin2: 0, cos1: -2, cos2: 0},
    {sin1: -3, sin2: 0, cos1: 0, cos2: 0},
    {sin1: -2, sin2: 0, cos1: -2, cos2: 0},
    {sin1: 0, sin2: 0, cos1: -2, cos2: 0}
];

// Utility functions for degree/radian conversion
function degToRad(degrees: number) {
    return degrees * (Math.PI / 180.0);
}

function radToDeg(radians: number) {
    return radians * (180.0 / Math.PI);
}

type Vector3 = [number, number, number];

function shiftUnitVector(vector: Vector3, shift: Vector3): Vector3 {
    let res: Vector3 = [ vector[0] + shift[0], vector[1] + shift[1], vector[2] + shift[2] ];
    let norm = Math.sqrt(res[0] * res[0] + res[1] * res[1] + res[2] * res[2]);
    if (norm > 0) {
        res[0] /= norm;
        res[1] /= norm;
        res[2] /= norm;
    }
    return res;
}

// This is not always possible, depending on the shift.
function unshiftUnitVector(vector: Vector3, shift: Vector3): Vector3 {
    let [px, py, pz] = vector;
    const [X, Y, Z] = shift;
    // Find intersection of line [k*px, k*py, k*pz] with the sphere of radius 1 centered at (X, Y, Z)
    // (X - k*px)^2 + (Y - k*py)^2 + (Z - k*pz)^2 = 1
    // Rearranging for k gives:
    // X² - 2*X*k*px + k²*(px² + py² + pz²) + Y² - 2*Y*k*py + Z² - 2*Z*k*pz = 1
    // This is a quadratic equation in k:
    // (px² + py² + pz²) * k² - 2*(X*px + Y*py + Z*pz) * k + (X² + Y² + Z² - 1) = 0

    const A = px * px + py * py + pz * pz;
    const B = -2 * (X * px + Y * py + Z * pz);
    const C = X * X + Y * Y + Z * Z - 1;

    // Calculate the discriminant
    const discriminant = B * B - 4 * A * C;

    if (discriminant < 0) {
        throw new Error("No solution for aberration cancellation");
    }
    // There are two solutions
    const k1 = (-B + Math.sqrt(discriminant)) / (2 * A);
    const k2 = (-B - Math.sqrt(discriminant)) / (2 * A);
    // We take the positive solution. If none, or two of them, the displacement is too big and cannot be cancelled
    if (k1 > 0 && k2 > 0) {
        throw new Error("Ambiguous solution for aberration cancellation");
    }
    const k = Math.max(k1, k2);
    if (k <= 0) {
        throw new Error("No positive solution for aberration cancellation");
    }

    px *= k;
    py *= k;
    pz *= k;

    // Check the distance to the point (X, Y, Z)

    // Now cancel the movement
    px -= X;
    py -= Y;
    pz -= Z;

    // Normalize the vector
    const norm = Math.sqrt(px * px + py * py + pz * pz);
    if (norm > 0) {
        px /= norm;
        py /= norm;
        pz /= norm;
    }

    return [px, py, pz];
}

type RADECDEG = {
    ra: number; // Right Ascension in degrees
    dec: number; // Declination in degrees
};

/**
 * Calculate a star's equatorial coordinates from its mean equatorial coordinates
 * with the effects of aberration for a given Julian Day.
 * 
 * @param {Object} meanPosition - Mean position of object {ra: number, dec: number}
 * @param {number} JD - Julian Day
 * @returns {Object} New object position {ra: number, dec: number}
 */
function applyEquatorialAberration(meanPosition: RADECDEG, JD: number, direction = 1) {
    // Speed of light in 10^-8 au per day
    const c = 17314463350.0;
    
    // Calculate T
    const T = (JD - 2451545.0) / 36525.0;
    
    // Calculate planetary perturbations
    const L2 = 3.1761467 + 1021.3285546 * T;
    const L3 = 1.7534703 + 628.3075849 * T;
    const L4 = 6.2034809 + 334.0612431 * T;
    const L5 = 0.5995464 + 52.9690965 * T;
    const L6 = 0.8740168 + 21.329909095 * T;
    const L7 = 5.4812939 + 7.4781599 * T;
    const L8 = 5.3118863 + 3.8133036 * T;
    const LL = 3.8103444 + 8399.6847337 * T;
    const D = 5.1984667 + 7771.3771486 * T;
    const MM = 2.3555559 + 8328.6914289 * T;
    const F = 1.6279052 + 8433.4661601 * T;
    
    let X = 0;
    let Y = 0;
    let Z = 0;
    
    // Sum the terms
    for (let i = 0; i < TERMS; i++) {
        const A = argumentsData[i].a_L2 * L2 + argumentsData[i].a_L3 * L3 +
                  argumentsData[i].a_L4 * L4 + argumentsData[i].a_L5 * L5 +
                  argumentsData[i].a_L6 * L6 + argumentsData[i].a_L7 * L7 +
                  argumentsData[i].a_L8 * L8 + argumentsData[i].a_LL * LL +
                  argumentsData[i].a_D * D + argumentsData[i].a_MM * MM +
                  argumentsData[i].a_F * F;
        
        X += (x_coefficients[i].sin1 + x_coefficients[i].sin2 * T) * Math.sin(A) +
             (x_coefficients[i].cos1 + x_coefficients[i].cos2 * T) * Math.cos(A);
        Y += (y_coefficients[i].sin1 + y_coefficients[i].sin2 * T) * Math.sin(A) +
             (y_coefficients[i].cos1 + y_coefficients[i].cos2 * T) * Math.cos(A);
        Z += (z_coefficients[i].sin1 + z_coefficients[i].sin2 * T) * Math.sin(A) +
             (z_coefficients[i].cos1 + z_coefficients[i].cos2 * T) * Math.cos(A);
    }

    // Alternative method for high declinations
    X /= c;
    Y /= c;
    Z /= c;
    
    // Convert to radians
    const meanRA = degToRad(meanPosition.ra);
    const meanDec = degToRad(meanPosition.dec);
    
    
    const cosDec = Math.cos(meanDec);
    let px = cosDec * Math.cos(meanRA);
    let py = cosDec * Math.sin(meanRA);
    let pz = Math.sin(meanDec);


    if (direction == 1) {
        [px, py, pz] = shiftUnitVector([px, py, pz], [X, Y, Z]);
    } else {
        // The simple approach to use -[x,y,z] gives a max error of ~0.0005078771283073923"
        // The max error is reduced to 0.00001954745752809927" (increase precision by 26x)
        [px, py, pz] = unshiftUnitVector([px, py, pz], [X, Y, Z]);
        // [px, py, pz] = shiftUnitVector([px, py, pz], [-X, -Y, -Z]);
    }


    const ra = Math.atan2(py, px);
    let dec = Math.acos(Math.sqrt(px * px + py * py));
    if (pz < 0) {
        dec = -dec;
    } 

    return {
        ra: (radToDeg(ra) + 360) % 360,
        dec: radToDeg(dec)
    };
}

function getEquatorialAberration(meanPosition: RADECDEG, JD: number) {
    return applyEquatorialAberration(meanPosition, JD, 1);
}


/**
 * Cancel the effects of aberration from equatorial coordinates to get the mean position.
 * This is the inverse operation of getEquatorialAberration.
 * 
 * @param {Object} apparentPosition - Apparent position with aberration {ra: number, dec: number}
 * @param {number} JD - Julian Day
 * @returns {Object} Mean object position {ra: number, dec: number}
 */
function cancelEquatorialAberration(apparentPosition: RADECDEG, JD: number) {
    return applyEquatorialAberration(apparentPosition, JD, -1);
}

// Export the functions
export {
    getEquatorialAberration,
    cancelEquatorialAberration,
};

// Default export for convenience
export default {
    getEquatorialAberration,
    cancelEquatorialAberration,
};
