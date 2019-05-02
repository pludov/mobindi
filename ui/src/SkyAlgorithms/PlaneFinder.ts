export type PlaneEquation = [number, number, number, number];


// Transposed from https://www.ilikebigbits.com/2015_03_04_plane_from_points.html
// Compute the equation of a plane that fit the data.
// The norm of [a,b,c] is always 1 (so applying the eq to a points returns the distance from the plane)
// This is not stricly the bestfit, it is a best fit according to the distance over the largest axes.
// Probably strong enough for polar alignment, where you expect points to be on a plane almost perpendicular to NS axis
export function bestFit(points : Array<Array<number>>):PlaneEquation|null
{
    if (points.length < 3) {
        return null;
    }

    let sum = [0, 0, 0];
    for(const p of points) {
        sum[0] += p[0];
        sum[1] += p[1];
        sum[2] += p[2];
    }
    let centroid = sum.map(e=>e * (1.0 / (points.length)));

    // Calc full 3x3 covariance matrix, excluding symmetries:
    let xx = 0.0; let xy = 0.0; let xz = 0.0;
    let yy = 0.0; let yz = 0.0; let zz = 0.0;

    for(const p of points) {
        const r = [p[0] - centroid[0], p[1] - centroid[1], p[2] - centroid[2]];
        xx += r[0] * r[0];
        xy += r[0] * r[1];
        xz += r[0] * r[2];
        yy += r[1] * r[1];
        yz += r[1] * r[2];
        zz += r[2] * r[2];
    }

    let det_x = yy*zz - yz*yz;
    let det_y = xx*zz - xz*xz;
    let det_z = xx*yy - xy*xy;

    const det_max = Math.max(det_x, det_y, det_z);
    if (det_max <= 0.0) {
        return null;
    }

    let dir: { x: number; y: number; z: number; };

    // Pick path with best conditioning:
    if (det_max == det_x) {
        dir = {
            x: det_x,
            y: xz*yz - xy*zz,
            z: xy*yz - xz*yy,
        }
    } else if (det_max == det_y) {
        dir = {
            x: xz*yz - xy*zz,
            y: det_y,
            z: xy*xz - yz*xx,
        }
    } else {
        dir = {
            x: xy*yz - xz*yy,
            y: xy*xz - yz*xx,
            z: det_z,
        }
    };

    const norm = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z);
    dir.x /= norm;
    dir.y /= norm;
    dir.z /= norm;

    const d = - (centroid[0] * dir.x + centroid[1] * dir.y + centroid[2] * dir.z);

    return [dir.x, dir.y, dir.z, d];
}
