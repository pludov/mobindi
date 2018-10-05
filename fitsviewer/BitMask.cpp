#include <iostream>

#include "BitMask.h"

using namespace std;

void BitMask::grow(const BitMask & mask)
{
	morph(mask, true);
}

void BitMask::erode(const BitMask & mask)
{
	morph(mask, false);
}

void BitMask::morph(const BitMask & mask, bool isGrow)
{
	int dirx[] = {-1, 1, 0, 0};
	int diry[] = {0, 0, -1, 1};

	bool updated;
	
	
	do {
		updated = false;
		
		BitMask added(this->x0, this->y0, this->x1, this->y1);
		for(int y = y0; y <= y1; ++y)
			for(int x = x0; x <= x1; ++x)
			{
				if (get(x, y) == isGrow) {
					for(int spread = 0; spread < 4; ++spread)
					{
						int nvx = x  + dirx[spread];
						int nvy = y  + diry[spread];
						
						if (nvx < x0 || nvx > x1) continue;
						if (nvy < y0 || nvy > y1) continue;
						
						if (get(nvx, nvy) == isGrow) continue;
						if (!mask.get(nvx, nvy)) continue;
						added.set(nvx, nvy, true);
						updated = true;
					}
				}
			}
		
		if (updated) {
			if (isGrow) {
				this->content|=added.content;
			} else {
				added.content.invert();
				this->content&=added.content;
			}
		}

	} while(updated);
}

BitMask & BitMask::operator=(const BitMask & other)
{
	sx = other.sx;
	sy = other.sy;
	x0 = other.x0;
	y0 = other.y0;
	x1 = other.x1;
	y1 = other.y1;
	content = other.content;
	return *this;
}


std::string BitMask::toString() const
{
	std::string result;
	for(int y = y0; y <= y1; ++y) {
		for(int x = x0; x <= x1; ++x) {
			if (get(x, y)) {
				result += 'x';
			} else {
				result += ' ';
			}
		}
		result += "\n";
	}
	return result;
}

BitMaskIterator BitMask::iterator() const {
	return BitMaskIterator(*this);
}

BitMaskIterator::BitMaskIterator(const BitMask & bm) : bm(bm), offset(-1)
{}



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
	while(finalVector[grp] != grp) {
		grp = finalVector[grp];
	}
	return grp;
}

std::vector<shared_ptr<std::vector<int>>> CGroupComputer::result() {
	std::vector<shared_ptr<std::vector<int>>> rslt;
	cerr << "group count" << groupCount << "\n";
	rslt.reserve(groupCount);

	std::vector<int> vectorToGroup(groupSize.size());
	int groupId = 0;
	for(int i = 0; i < groupSize.size(); ++i)
	{
		if (finalVector[i] == i) {
			vectorToGroup[i] = groupId;
            rslt.push_back(std::make_shared<std::vector<int>>());
			rslt[groupId]->reserve(2 * groupSize[i]);
			groupId++;
		}
	}

	// FIXME: on est au pire en n² ici
	for(int i = 0; i < groupSize.size(); ++i)
	{
		if (finalVector[i] != i) {
			vectorToGroup[i] = vectorToGroup[findActualGroup(i)];
		}
	}

	for(int y = bm.y0; y <= bm.y1; ++y)
		for(int x = bm.x0; x <= bm.x1; ++x)
			if (bm.get(x, y)) {
				int off = bm.offset(x, y);
				int vecId = connexityByPix[off];
				int groupId = vectorToGroup[vecId];
				rslt[groupId]->push_back(x);
				rslt[groupId]->push_back(y);
			}
    return rslt;
}
