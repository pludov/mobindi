#include <iostream>

#include "BitMask.h"

using namespace std;


CGroupComputer::CGroupComputer(const BitMask & _bm):
	bm(_bm),
	connexityByPix(bm.sx * bm.sy),
	groupSize(),
	finalVector(),
	groupCount(0)
{
}

int CGroupComputer::newGroup() {
	int result = groupSize.size();
	groupSize.push_back(0);
	finalVector.push_back(result);
	groupCount++;
	return result;
}

int CGroupComputer::mergeGroups(int a, int b)
{
	if (a == b) return a;

	if (a < b) {
		int tmp = a;
		a = b;
		b = tmp;
	}

	finalVector[b] = a;
	groupSize[a] += groupSize[b];
	groupSize[b] = 0;
	groupCount--;
	return a;
}

void CGroupComputer::proceed() {
	for(int y = bm.y0; y <= bm.y1; ++y)
		for(int x = bm.x0; x <= bm.x1; ++x)
			if (bm.get(x, y)) {
				int grp = -1;
				if (x > bm.x0 && bm.get(x-1, y)) {
					// Rattachement à gauche
					grp = findActualGroup(connexityByPix[bm.offset(x-1,y)]);
				}
				if (y > bm.y0 && bm.get(x, y - 1)) {
					if (grp == -1) {
						// Rattachement en haut
						grp = connexityByPix[bm.offset(x, y - 1)];
					} else {
						// Merge two groups
						grp = mergeGroups(grp, findActualGroup(connexityByPix[bm.offset(x, y - 1)]));
					}
				}
				if (grp == -1) {
					grp = newGroup();
				}
				connexityByPix[bm.offset(x,y)] = grp;
				groupSize[grp]++;
			}
}

int CGroupComputer::findActualGroup(int grp) {
	while(!groupSize[grp]) {
		grp = finalVector[grp];
	}
	return finalVector[grp];
}

std::vector<shared_ptr<std::vector<int>>> CGroupComputer::result() {
	std::vector<shared_ptr<std::vector<int>>> rslt;
	cerr << "group count" << groupCount << "\n";
	rslt.reserve(groupCount);
	int groupId = 0;
	for(int i = 0; i < groupSize.size(); ++i)
	{
		if (groupSize[i]) {
			finalVector[i] = groupId;
            rslt.push_back(std::make_shared<std::vector<int>>());
			rslt[groupId]->reserve(2 * groupSize[i]);
			groupId++;
		}
	}

	// FIXME: on est au pire en n² ici
	for(int i = 0; i < groupSize.size(); ++i)
	{
		if (!groupSize[i]) {
			finalVector[i] = findActualGroup(i);
		}
	}

	for(int y = bm.y0; y <= bm.y1; ++y)
		for(int x = bm.x0; x <= bm.x1; ++x)
			if (bm.get(x, y)) {
				int off = bm.offset(x, y);
				int vecId = connexityByPix[off];
				vecId = finalVector[vecId];
				rslt[vecId]->push_back(x);
				rslt[vecId]->push_back(y);
			}
    return rslt;
}
