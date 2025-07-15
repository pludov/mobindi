
import Quaternion from "quaternion";
import SkyProjection from "./SkyProjection";

// Raise an error if an axis is bellow this efficiency ratio (so the user will pick a better position)
export const minimumAxeRatio = 0.1;

// Good => still useable => bad
export const orthogonalityThreshold = [60, 30];

/**
 * Compute a vector base to evaluation mount moves in resp. alt & az,
 * at (or near) the given target image position
 * 
 * The base is returned as 2D vector on the 3D plane at z=1.
 * The transformation from the imagePos to the center of this plane is returned.
 */
export function getMountMovementEvaluationBase(mountAxe: {alt:number, az:number}, imagePos: [number, number, number])  {
    // We can derive a 'alt' vector and a 'az' vector by under/over correcting in alt/az.
    // We project theses vectors on the plane defined by quatALTAZ3D

    // This returns the reference image shifted by a small transform in alt/az
    let getRefALTAZ3DVec = (epsilon_alt_deg:number, epsilon_az_deg: number) => {
        // Défaire l'azimuth
        // Défaire l'altitude
        // Faire la nouvelle altitude
        // Faire la nouvell azimuth

        const operations = [
            // Undo azimuth
            Quaternion.fromAxisAngle([1,0,0], mountAxe.az * Math.PI / 180),
            // Undo alt
            Quaternion.fromAxisAngle([0,1,0], -mountAxe.alt * Math.PI / 180),
            // Apply new alt
            Quaternion.fromAxisAngle([0,1,0], (mountAxe.alt + epsilon_alt_deg) * Math.PI / 180),
            // Apply new az
            Quaternion.fromAxisAngle([1,0,0], -(mountAxe.az + epsilon_az_deg) * Math.PI / 180),
        ];

        let vector = imagePos;
        for(const op of operations) {
            vector = op.rotateVector(vector);
        }
        return vector;
    }

    let vec_sub = (a:[number, number, number], b:[number, number, number]) : [number, number, number] => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

    let refAltAz3DVec = getRefALTAZ3DVec(0, 0);
    let epsilon_deg = 1 / 60;

    // Create a rotation that sends everything on the x, y plane (so we report 2D angles)
    // Origin of this base is the reference frame.
    let evaluationProjection = Quaternion.fromBetweenVectors(refAltAz3DVec, [0,0,1]);

    let alt_az_target_base = [
        evaluationProjection.rotateVector(vec_sub(getRefALTAZ3DVec(epsilon_deg, 0), refAltAz3DVec)),
        evaluationProjection.rotateVector(vec_sub(getRefALTAZ3DVec(0, epsilon_deg), refAltAz3DVec)),
    ];

    // Unit is one degree, divide accordingly
    for(let vec of alt_az_target_base) {
        vec[0] /= epsilon_deg; vec[1] /= epsilon_deg; vec[2] /= epsilon_deg;
    }
    
    return { alt_az_target_base , evaluationProjection };
}

export function getAngleCos2D(vec1: number[], vec2: number[]): number {
    // normalize
    const n1 = Math.sqrt(vec1[0]*vec1[0] + vec1[1]*vec1[1]);
    const n2 = Math.sqrt(vec2[0]*vec2[0] + vec2[1]*vec2[1]);
    const dot = vec1[0]*vec2[0] + vec1[1]*vec2[1];
    const cos = dot / (n1 * n2);
    return cos;
}

export function evalPolarAlignmentPosition(scopeAltAz:{alt: number, az:number}, axe : {alt:number, az:number}): { alt_norm: number, az_norm: number, eval_angle: number} {
    const scopeAltAz3DVec = SkyProjection.convertAltAzToALTAZ3D(scopeAltAz);

    let {alt_az_target_base} = getMountMovementEvaluationBase(axe, scopeAltAz3DVec);

    let base_angle_cose = getAngleCos2D(alt_az_target_base[0], alt_az_target_base[1]);

    const [alt_norm, az_norm] = alt_az_target_base.map((vec)=> {
        let norm = Math.sqrt(vec[0]*vec[0] + vec[1]*vec[1]);
        let degree = norm * 360 / (2 * Math.PI);
        return degree;
    })

    let base_angle = 180 * Math.acos(base_angle_cose) / Math.PI;

    let eval_angle = 90 - Math.abs(90 - base_angle);
    return {alt_norm, az_norm, eval_angle};
}


